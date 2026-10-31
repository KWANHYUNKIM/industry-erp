package com.erp.accounting.ledger.balanceadjust;

import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.ledger.account.AccountDivision;
import com.erp.accounting.ledger.account.AccountRepository;
import com.erp.accounting.ledger.balanceadjust.dto.BalanceAdjustDtos.*;
import com.erp.accounting.ledger.journal.JournalEntry;
import com.erp.accounting.ledger.journal.JournalEntryRepository;
import com.erp.accounting.ledger.journal.JournalLine;
import com.erp.accounting.ledger.journal.JournalLineRepository;
import com.erp.accounting.ledger.journal.JournalSourceType;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.partner.PartnerService;
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
    /** 잔액실사(거래처별) 줄의 거래처 — accounting → trade(허용 간선) */
    private final PartnerService partnerService;

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

    /**
     * 계정의 묶음 방식 — 거래처별집계구분이 거래처별이면 거래처(+ ☑부서별 · ☑프로젝트별), 없음이면 예전처럼 부서 · 프로젝트(잔액실사(계정별)).
     */
    record Mode(boolean partner, boolean dept, boolean proj) {
        static Mode of(Account a) {
            return a.isPartnerAggregate() ? new Mode(true, a.isAggregateByDept(), a.isAggregateByProject()) : new Mode(false, true, true);
        }
        String key(Long pt, Long d, Long p) {
            return (partner && pt != null ? pt : "") + ":" + (dept && d != null ? d : "") + ":" + (proj && p != null ? p : "");
        }
    }

    /** 원본 격자 글자 — '거래처별/부서별/프로젝트별'(1089 외상매출금) · '계정별'(현금 · 상품). */
    static String aggregationLabel(Account a) {
        if (!a.isPartnerAggregate()) return "계정별";
        return "거래처별" + (a.isAggregateByDept() ? "/부서별" : "") + (a.isAggregateByProject() ? "/프로젝트별" : "");
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
            rows.add(new AccountBalanceRow(a.getId(), a.getCode(), a.getName(), a.getDivision().name(), aggregationLabel(a),
                    dr ? bal : BigDecimal.ZERO, dr ? BigDecimal.ZERO : bal,
                    adjusted.getOrDefault(a.getId(), List.of()),
                    a.isPartnerAggregate(), a.isAggregateByDept(), a.isAggregateByProject()));
        }
        rows.sort(Comparator.comparing(AccountBalanceRow::code));
        return rows;
    }

    /**
     * '거래처별집계구분' 창 [저장] — ○없음 ◉거래처별 · ☑부서별집계 · ☑프로젝트별집계(원본 2026-10-29 실측). 계정등록의
     * [거래처별집계구분](partner_aggregate)과 같은 값이다.
     */
    @Transactional
    public void setAggregation(Long accountId, AggregationRequest req) {
        Account a = account(accountId);
        a.setPartnerAggregate(req.byPartner());
        a.setAggregateByDept(req.byDept());
        a.setAggregateByProject(req.byProject());
    }

    /** 기준일자까지 묶음별 장부잔액(계정 쪽 부호). exclude 전표(고치는 중인 잔액조정)는 뺀다. parts 에 묶음 → [거래처, 부서, 프로젝트]. */
    private Map<String, BigDecimal> bookOf(Account a, Mode m, LocalDate asOf, long exclude, Map<String, Long[]> parts) {
        Map<String, BigDecimal> book = new LinkedHashMap<>();
        List<Object[]> rs = m.partner() ? adjustRepository.sumByPartnerDeptProject(a.getId(), asOf, exclude)
                : adjustRepository.sumByDeptProject(a.getId(), asOf, exclude);
        int o = m.partner() ? 1 : 0;
        for (Object[] r : rs) {
            Long pt = m.partner() ? (Long) r[0] : null, d = (Long) r[o], p = (Long) r[o + 1];
            String k = m.key(pt, d, p);
            book.merge(k, signed(a.getDivision(), (BigDecimal) r[o + 2], (BigDecimal) r[o + 3]), BigDecimal::add);
            parts.putIfAbsent(k, new Long[]{m.partner() ? pt : null, m.dept() ? d : null, m.proj() ? p : null});
        }
        return book;
    }

    private AuditGroupRow group(Long pt, Long d, Long p, BigDecimal book, BigDecimal actual, String memo) {
        BusinessPartner bp = pt == null ? null : partnerService.get(pt);
        return new AuditGroupRow(pt, bp == null ? null : bp.getCode(), bp == null ? null : bp.getName(), d, p, book, actual, memo);
    }

    @Transactional(readOnly = true)
    public AuditResponse audit(LocalDate asOf, Long accountId, Long entryId) {
        Account a = account(accountId);
        Mode m = Mode.of(a);
        Map<String, Long[]> parts = new HashMap<>();
        Map<String, BigDecimal> book = bookOf(a, m, asOf, entryId == null ? 0L : entryId, parts);
        Map<String, AuditGroupRow> groups = new LinkedHashMap<>();
        if (!m.partner()) groups.put(m.key(null, null, null), group(null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, null));
        for (Map.Entry<String, BigDecimal> b : book.entrySet()) {
            // 거래처별은 잔액이 남은 묶음만 — 다 갚은 거래처까지 늘어서면 실사할 줄을 찾을 수 없다(없는 거래처는 빈 줄로 더한다)
            if (m.partner() && b.getValue().signum() == 0) continue;
            Long[] k = parts.get(b.getKey());
            groups.put(b.getKey(), group(k[0], k[1], k[2], b.getValue(), b.getValue(), null));
        }
        if (entryId != null) {
            JournalEntry e = adjustment(entryId);
            for (JournalLine l : e.getLines()) {
                if (!l.getAccount().getId().equals(accountId)) continue;
                Long pt = l.getPartner() == null ? null : l.getPartner().getId();
                String k = m.key(pt, l.getDepartmentId(), l.getProjectId());
                BigDecimal bk = book.getOrDefault(k, BigDecimal.ZERO);
                AuditGroupRow g = groups.get(k);
                if (g == null) g = group(m.partner() ? pt : null, m.dept() ? l.getDepartmentId() : null,
                        m.proj() ? l.getProjectId() : null, bk, bk, null);
                groups.put(k, new AuditGroupRow(g.partnerId(), g.partnerCode(), g.partnerName(), g.departmentId(), g.projectId(),
                        g.bookAmount(), g.bookAmount().add(diffOf(l)), l.getDescription()));
            }
        }
        return new AuditResponse(asOf, a.getId(), a.getCode(), a.getName(), new ArrayList<>(groups.values()),
                m.partner(), m.dept(), m.proj());
    }

    @Transactional
    public AdjustmentRow save(SaveRequest req, String username) {
        if (req.asOf() == null) throw ApiException.badRequest("기준일자를 입력 바랍니다.");
        Account a = account(req.accountId());
        Mode m = Mode.of(a);
        JournalEntry old = req.replaceEntryId() == null ? null : adjustment(req.replaceEntryId());
        Map<String, Long[]> parts = new HashMap<>();
        Map<String, BigDecimal> book = bookOf(a, m, req.asOf(), old == null ? 0L : old.getId(), parts);
        Set<String> seen = new HashSet<>();
        List<JournalLine> lines = new ArrayList<>();
        String firstMemo = null;
        for (SaveRow row : req.rows() == null ? List.<SaveRow>of() : req.rows()) {
            String k = m.key(row.partnerId(), row.departmentId(), row.projectId());
            BigDecimal bk = book.getOrDefault(k, BigDecimal.ZERO);
            BigDecimal actual = row.actualAmount() != null ? row.actualAmount()
                    : (req.zeroUnchanged() && book.containsKey(k) ? BigDecimal.ZERO : null);
            if (actual == null || !seen.add(k)) continue;
            BigDecimal diff = actual.subtract(bk);
            if (diff.signum() == 0) continue;
            String memo = row.memo() == null || row.memo().isBlank() ? null : row.memo().trim();
            if (firstMemo == null) firstMemo = memo;
            lines.add(adjustLine(a, diff, memo, m.partner() ? row.partnerId() : null,
                    m.dept() ? row.departmentId() : null, m.proj() ? row.projectId() : null, actual));
        }
        if (req.zeroUnchanged()) {   // 화면에 안 보낸 묶음도 0 으로
            for (Map.Entry<String, BigDecimal> b : book.entrySet()) {
                if (seen.contains(b.getKey()) || b.getValue().signum() == 0) continue;
                Long[] k = parts.get(b.getKey());
                lines.add(adjustLine(a, b.getValue().negate(), null, k[0], k[1], k[2], BigDecimal.ZERO));
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

    /** 조정 줄 — 차이를 계정의 차대 쪽에(차변 쪽 계정에서 늘면 차변). 거래처별이면 줄 거래처가 그 거래처다. */
    private JournalLine adjustLine(Account a, BigDecimal diff, String memo, Long partnerId, Long d, Long p, BigDecimal actual) {
        boolean toDebit = debitSide(a.getDivision()) == (diff.signum() > 0);
        return JournalLine.builder().account(a)
                .debit(toDebit ? diff.abs() : BigDecimal.ZERO).credit(toDebit ? BigDecimal.ZERO : diff.abs())
                .description(memo).partner(partnerId == null ? null : partnerService.get(partnerId))
                .departmentId(d).projectId(p).adjustActual(actual).build();
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
}
