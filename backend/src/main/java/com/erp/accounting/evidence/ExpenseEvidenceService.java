package com.erp.accounting.evidence;

import com.erp.accounting.account.Account;
import com.erp.accounting.account.AccountRepository;
import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.AccountSetting;
import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.CompareRow;
import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.StatusResponse;
import com.erp.accounting.evidence.dto.ExpenseEvidenceDtos.StatusRow;
import com.erp.accounting.journal.JournalLine;
import com.erp.accounting.journal.JournalLineRepository;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * 지출증빙현황(세무 › 법인세 E030402) — [계정설정]에서 '표시' 로 고른 계정의 분개를 증빙 종류별로 나눠 모은다.
 *
 * <p>원본은 분개 줄을 그 전표에 이어진 <b>매출매입자료</b>(세금계산서 · 카드 · 현금영수증 …)의 유형으로 나누고,
 * 이어진 자료가 없으면 '증빙없음' 이다(금액 링크 → 전표vs매출매입자료비교). 우리 매출매입자료는 매입/매출장과 같이
 * <b>매입 부가세(135) 줄이 든 회계전표</b>이고 유형은 늘 세금계산서다 — 그래서 열은 '세금계산서'(자료가 있을 때) · '증빙없음'.
 * 금액은 차변 − 대변.
 */
@Service
@RequiredArgsConstructor
public class ExpenseEvidenceService {

    public static final String NO_EVIDENCE = "증빙없음";
    public static final String TAX_INVOICE = "세금계산서";

    private final JournalLineRepository lineRepository;
    private final AccountRepository accountRepository;

    @Transactional(readOnly = true)
    public StatusResponse status(String from, String to) {
        LocalDate start = month(from).atDay(1), end = month(to).atEndOfMonth();
        if (start.isAfter(end)) throw ApiException.badRequest("기준월의 시작이 끝보다 늦습니다: " + from + " ~ " + to);
        List<JournalLine> lines = lineRepository.findEvidenceReportLines(start, end);
        Map<Long, BigDecimal[]> vat = vatByEntry(lines);

        Map<Long, StatusRow> byAccount = new TreeMap<>();
        Map<Long, Map<String, BigDecimal>> amounts = new HashMap<>();
        boolean anyInvoice = false;
        for (JournalLine l : lines) {
            String kind = kindOf(vat, l);
            anyInvoice |= TAX_INVOICE.equals(kind);
            amounts.computeIfAbsent(l.getAccount().getId(), k -> new LinkedHashMap<>())
                    .merge(kind, l.getDebit().subtract(l.getCredit()), BigDecimal::add);
        }
        List<StatusRow> rows = new ArrayList<>();
        lines.stream().map(JournalLine::getAccount).distinct()
                .sorted(Comparator.comparing(Account::getCode))
                .forEach(a -> {
                    Map<String, BigDecimal> m = amounts.get(a.getId());
                    rows.add(new StatusRow(a.getId(), a.getCode(), a.getName(), m,
                            m.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add)));
                });
        List<String> kinds = anyInvoice ? List.of(TAX_INVOICE, NO_EVIDENCE) : List.of(NO_EVIDENCE);
        return new StatusResponse(from, to, kinds, rows);
    }

    /** 금액 링크 — 그 계정 · 그 증빙의 분개 줄과 이어진 매출매입자료(전표vs매출매입자료비교). kind 가 비면 계정 전체(합계 칸). */
    @Transactional(readOnly = true)
    public List<CompareRow> compare(Long accountId, String kind, String from, String to) {
        LocalDate start = month(from).atDay(1), end = month(to).atEndOfMonth();
        List<JournalLine> lines = lineRepository.findEvidenceReportLines(start, end).stream()
                .filter(l -> accountId == null || l.getAccount().getId().equals(accountId)).toList();
        Map<Long, BigDecimal[]> vat = vatByEntry(lines);
        List<CompareRow> out = new ArrayList<>();
        for (JournalLine l : lines) {
            String k = kindOf(vat, l);
            if (kind != null && !kind.isBlank() && !kind.equals(k)) continue;
            var e = l.getEntry();
            String partner = e.getPartner() != null ? e.getPartner().getName() : null;
            if (TAX_INVOICE.equals(k)) {
                BigDecimal[] v = vat.get(e.getId());
                out.add(new CompareRow(e.getId(), e.getEntryDate(), e.getDocNo(), l.getAccount().getName(), partner,
                        l.getDebit(), l.getCredit(), e.getDocNo(), TAX_INVOICE, partner, v[1], v[0], v[1].add(v[0])));
            } else {
                out.add(new CompareRow(e.getId(), e.getEntryDate(), e.getDocNo(), l.getAccount().getName(), partner,
                        l.getDebit(), l.getCredit(), null, null, null, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO));
            }
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<AccountSetting> accounts() {
        return accountRepository.findAll().stream()
                .filter(Account::isActive)
                .sorted(Comparator.comparing(Account::getCode))
                .map(a -> new AccountSetting(a.getId(), a.getCode(), a.getName(), a.isEvidenceReport()))
                .toList();
    }

    /** [계정설정] 저장 — 고른 계정만 '표시', 나머지는 '표시안함'. */
    @Transactional
    public List<AccountSetting> saveAccounts(List<Long> shownIds) {
        Set<Long> shown = new HashSet<>(shownIds == null ? List.of() : shownIds);
        for (Account a : accountRepository.findAll()) {
            a.setEvidenceReport(shown.contains(a.getId()));
        }
        return accounts();
    }

    private Map<Long, BigDecimal[]> vatByEntry(List<JournalLine> lines) {
        Set<Long> ids = new HashSet<>();
        lines.forEach(l -> ids.add(l.getEntry().getId()));
        Map<Long, BigDecimal[]> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        for (Object[] r : lineRepository.purchaseVatByEntry(ids)) {
            out.put((Long) r[0], new BigDecimal[]{(BigDecimal) r[1], (BigDecimal) r[2]});
        }
        return out;
    }

    private static String kindOf(Map<Long, BigDecimal[]> vat, JournalLine l) {
        BigDecimal[] v = vat.get(l.getEntry().getId());
        return v != null && v[0].signum() != 0 ? TAX_INVOICE : NO_EVIDENCE;
    }

    private static YearMonth month(String ym) {
        try {
            return YearMonth.parse(ym);
        } catch (Exception e) {
            throw ApiException.badRequest("기준월 형식이 올바르지 않습니다(YYYY-MM): " + ym);
        }
    }
}
