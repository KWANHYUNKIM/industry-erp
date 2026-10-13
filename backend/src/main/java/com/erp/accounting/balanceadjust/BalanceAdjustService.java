package com.erp.accounting.balanceadjust;

import com.erp.accounting.account.Account;
import com.erp.accounting.account.AccountDivision;
import com.erp.accounting.account.AccountRepository;
import com.erp.accounting.balanceadjust.dto.BalanceAdjustDtos.*;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalEntryRepository;
import com.erp.accounting.journal.JournalLine;
import com.erp.accounting.journal.JournalLineRepository;
import com.erp.accounting.journal.JournalSourceType;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

/**
 * 회계 I › FastEntry › 잔액조정 — 2026-10-14 loginaa 실측(plans/회계1/E010209.md).
 *
 * <p>원본 잔액조정은 <b>한쪽 전표</b>다: [8109] 복리후생비(판) 장부잔액 6,620,000 → 실잔액 6,631,000 을 저장하자
 * 회계전표 2026/09/30 -16 이 차변 복리후생비(판) 11,000 · 대변 0 으로 생겼다(짝 계정 없음). 그래서 일반전표의 대차 검사를
 * 거치지 않고 직접 저장한다. 조정금액(차이)은 계정의 차대 쪽에 적는다 — 차변 쪽 계정(자산 · 비용)에서 실잔액이 크면 차변,
 * 작으면 대변. 실잔액은 줄의 adjust_actual 에 남겨 잔액조정조회의 장부가액 · 실가액을 그대로 보인다.
 */
@Service
@RequiredArgsConstructor
public class BalanceAdjustService {

    private static final LocalDate EPOCH = LocalDate.of(1900, 1, 1);
    private static final JournalSourceType TYPE = JournalSourceType.BALANCE_ADJUST;

    private final BalanceAdjustRepository adjustRepository;
    private final JournalEntryRepository entryRepository;
    private final JournalLineRepository lineRepository;
    private final AccountRepository accountRepository;
    private final DocumentNoGenerator docNoGenerator;

    static boolean debitSide(AccountDivision d) {
        return d == AccountDivision.ASSET || d == AccountDivision.EXPENSE;
    }

    /** 잔액(계정의 차대 쪽 부호) */
    private static BigDecimal signed(AccountDivision d, BigDecimal debit, BigDecimal credit) {
        return debitSide(d) ? debit.subtract(credit) : credit.subtract(debit);
    }

    /** 줄의 조정금액(계정 쪽 부호) */
    private static BigDecimal diffOf(JournalLine l) {
        return signed(l.getAccount().getDivision(), l.getDebit(), l.getCredit());
    }

    @Transactional(readOnly = true)
    public List<AccountBalanceRow> accounts(LocalDate asOf, long dept, long proj) {
        Map<Long, BigDecimal[]> sums = new HashMap<>();
        for (Object[] r : lineRepository.sumByAccountIn(EPOCH, asOf, dept, proj)) {
            sums.put((Long) r[0], new BigDecimal[]{(BigDecimal) r[4], (BigDecimal) r[5]});
        }
        Map<Long, List<Long>> adjusted = new HashMap<>();
        for (JournalEntry e : adjustRepository.findAdjustments(TYPE, asOf, asOf)) {
            e.getLines().stream().map((l) -> l.getAccount().getId()).distinct()
                    .forEach((a) -> adjusted.computeIfAbsent(a, (k) -> new ArrayList<>()).add(e.getId()));
        }
        List<AccountBalanceRow> rows = new ArrayList<>();
        for (Account a : accountRepository.findAll()) {
            BigDecimal[] s = sums.get(a.getId());
            if (!a.isActive() && s == null) continue;
            BigDecimal bal = s == null ? BigDecimal.ZERO : signed(a.getDivision(), s[0], s[1]);
            boolean dr = debitSide(a.getDivision());
            rows.add(new AccountBalanceRow(a.getId(), a.getCode(), a.getName(), a.getDivision().name(), "계정별",
                    dr ? bal : BigDecimal.ZERO, dr ? BigDecimal.ZERO : bal,
                    adjusted.getOrDefault(a.getId(), List.of())));
        }
        rows.sort(Comparator.comparing(AccountBalanceRow::code));
        return rows;
    }

    @Transactional(readOnly = true)
    public AuditResponse audit(LocalDate asOf, Long accountId, Long entryId) {
        Account a = account(accountId);
        Map<String, AuditGroupRow> groups = new LinkedHashMap<>();
        groups.put(key(null, null), new AuditGroupRow(null, null, BigDecimal.ZERO, BigDecimal.ZERO, null));
        for (Object[] r : adjustRepository.sumByDeptProject(accountId, asOf, entryId == null ? 0L : entryId)) {
            Long d = (Long) r[0], p = (Long) r[1];
            BigDecimal bal = signed(a.getDivision(), (BigDecimal) r[2], (BigDecimal) r[3]);
            groups.put(key(d, p), new AuditGroupRow(d, p, bal, bal, null));
        }
        if (entryId != null) {
            JournalEntry e = adjustment(entryId);
            for (JournalLine l : e.getLines()) {
                if (!l.getAccount().getId().equals(accountId)) continue;
                String k = key(l.getDepartmentId(), l.getProjectId());
                AuditGroupRow g = groups.getOrDefault(k, new AuditGroupRow(l.getDepartmentId(), l.getProjectId(), BigDecimal.ZERO, BigDecimal.ZERO, null));
                groups.put(k, new AuditGroupRow(g.departmentId(), g.projectId(), g.bookAmount(), g.bookAmount().add(diffOf(l)), l.getDescription()));
            }
        }
        return new AuditResponse(asOf, a.getId(), a.getCode(), a.getName(), new ArrayList<>(groups.values()));
    }

    @Transactional
    public AdjustmentRow save(SaveRequest req, String username) {
        if (req.asOf() == null) throw ApiException.badRequest("기준일자를 입력 바랍니다.");
        Account a = account(req.accountId());
        JournalEntry old = req.replaceEntryId() == null ? null : adjustment(req.replaceEntryId());
        Map<String, BigDecimal> book = new HashMap<>();
        for (Object[] r : adjustRepository.sumByDeptProject(a.getId(), req.asOf(), old == null ? 0L : old.getId())) {
            book.put(key((Long) r[0], (Long) r[1]), signed(a.getDivision(), (BigDecimal) r[2], (BigDecimal) r[3]));
        }
        Set<String> seen = new HashSet<>();
        List<JournalLine> lines = new ArrayList<>();
        String firstMemo = null;
        for (SaveRow row : req.rows() == null ? List.<SaveRow>of() : req.rows()) {
            String k = key(row.departmentId(), row.projectId());
            BigDecimal bk = book.getOrDefault(k, BigDecimal.ZERO);
            BigDecimal actual = row.actualAmount() != null ? row.actualAmount()
                    : (req.zeroUnchanged() && book.containsKey(k) ? BigDecimal.ZERO : null);
            if (actual == null || !seen.add(k)) continue;
            BigDecimal diff = actual.subtract(bk);
            if (diff.signum() == 0) continue;
            boolean toDebit = debitSide(a.getDivision()) == (diff.signum() > 0);
            String memo = row.memo() == null || row.memo().isBlank() ? null : row.memo().trim();
            if (firstMemo == null) firstMemo = memo;
            lines.add(JournalLine.builder().account(a)
                    .debit(toDebit ? diff.abs() : BigDecimal.ZERO).credit(toDebit ? BigDecimal.ZERO : diff.abs())
                    .description(memo).departmentId(row.departmentId()).projectId(row.projectId())
                    .adjustActual(actual).build());
        }
        if (req.zeroUnchanged()) {   // 화면에 안 보낸 묶음도 0 으로
            for (Map.Entry<String, BigDecimal> b : book.entrySet()) {
                if (seen.contains(b.getKey()) || b.getValue().signum() == 0) continue;
                Long[] dp = unkey(b.getKey());
                BigDecimal diff = b.getValue().negate();
                boolean toDebit = debitSide(a.getDivision()) == (diff.signum() > 0);
                lines.add(JournalLine.builder().account(a)
                        .debit(toDebit ? diff.abs() : BigDecimal.ZERO).credit(toDebit ? BigDecimal.ZERO : diff.abs())
                        .departmentId(dp[0]).projectId(dp[1]).adjustActual(BigDecimal.ZERO).build());
            }
        }
        if (lines.isEmpty()) throw ApiException.badRequest("변경된정보가 없습니다.");

        JournalEntry e;
        if (old != null) {
            e = old;
            e.getLines().clear();
            entryRepository.flush();
            e.setUpdatedBy(username);
        } else {
            e = JournalEntry.builder()
                    .docNo(docNoGenerator.next("GL-", "journal_entries", "doc_no", "entry_date", req.asOf()))
                    .entryDate(req.asOf()).sourceType(TYPE).createdBy(username).updatedBy(username).build();
        }
        e.setDescription(firstMemo);
        lines.forEach(e::addLine);
        return rowOf(entryRepository.save(e));
    }

    @Transactional(readOnly = true)
    public List<AdjustmentRow> list(LocalDate from, LocalDate to) {
        return adjustRepository.findAdjustments(TYPE, from, to).stream().map(BalanceAdjustService::rowOf).toList();
    }

    @Transactional(readOnly = true)
    public List<StatusRow> status(LocalDate from, LocalDate to) {
        List<StatusRow> rows = new ArrayList<>();
        List<JournalEntry> es = new ArrayList<>(adjustRepository.findAdjustments(TYPE, from, to));
        es.sort(Comparator.comparing(JournalEntry::getEntryDate).thenComparing(JournalEntry::getId));
        for (JournalEntry e : es) {
            for (JournalLine l : e.getLines()) {
                boolean dr = debitSide(l.getAccount().getDivision());
                BigDecimal after = l.getAdjustActual() == null ? BigDecimal.ZERO : l.getAdjustActual();
                BigDecimal diff = diffOf(l);
                rows.add(new StatusRow(e.getEntryDate(), l.getAccount().getCode(), l.getAccount().getName(),
                        l.getPartner() == null ? null : l.getPartner().getName(), l.getDepartmentId(), l.getProjectId(),
                        dr ? after : null, dr ? null : after, dr ? diff : null, dr ? null : diff, l.getDescription()));
            }
        }
        return rows;
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids == null ? List.<Long>of() : ids) entryRepository.delete(adjustment(id));
    }

    private static AdjustmentRow rowOf(JournalEntry e) {
        BigDecimal actual = BigDecimal.ZERO, diff = BigDecimal.ZERO;
        Account a = null;
        for (JournalLine l : e.getLines()) {
            if (a == null) a = l.getAccount();
            actual = actual.add(l.getAdjustActual() == null ? BigDecimal.ZERO : l.getAdjustActual());
            diff = diff.add(diffOf(l));
        }
        return new AdjustmentRow(e.getId(), e.getDocNo(), e.getEntryDate(), a == null ? null : a.getId(),
                a == null ? null : a.getCode(), a == null ? null : a.getName(),
                actual.subtract(diff), actual, e.getDescription(), e.getCreatedBy());
    }

    private JournalEntry adjustment(Long id) {
        JournalEntry e = entryRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("잔액조정 전표를 찾을 수 없습니다. id=" + id));
        if (e.getSourceType() != TYPE) throw ApiException.badRequest("잔액조정 전표가 아닙니다: " + e.getDocNo());
        return e;
    }

    private Account account(Long id) {
        if (id == null) throw ApiException.badRequest("계정을 입력 바랍니다.");
        return accountRepository.findById(id).orElseThrow(() -> ApiException.notFound("계정을 찾을 수 없습니다. id=" + id));
    }

    private static String key(Long d, Long p) { return (d == null ? "" : d) + ":" + (p == null ? "" : p); }

    private static Long[] unkey(String k) {
        String[] s = k.split(":", -1);
        return new Long[]{s[0].isEmpty() ? null : Long.valueOf(s[0]), s[1].isEmpty() ? null : Long.valueOf(s[1])};
    }
}
