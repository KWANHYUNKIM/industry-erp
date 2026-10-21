package com.erp.accounting.foreignledger;

import com.erp.accounting.account.AccountDivision;
import com.erp.accounting.foreignledger.dto.ForeignLedgerDtos.Response;
import com.erp.accounting.foreignledger.dto.ForeignLedgerDtos.Row;
import com.erp.accounting.journal.JournalLine;
import com.erp.accounting.journal.JournalLineRepository;
import com.erp.trade.partner.BusinessPartner;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 외화장부 — 외화 코드가 든 회계 전표 줄(V456 journal_lines.currency_code · foreign_amount)을
 * 계정 · 거래처 · 외화별로 모은다. 원본 조건: 검색구분(거래처별집계 · 건별) · 기준일자 · 계정 · 거래처 · 부서 · 프로젝트 · 외화.
 * 잔액 방향은 계정 대차 — 자산 · 비용은 차변 − 대변, 그 밖은 대변 − 차변.
 */
@Service
@RequiredArgsConstructor
public class ForeignLedgerService {

    private final JournalLineRepository journalLineRepository;

    @Transactional(readOnly = true)
    public Response ledger(String mode, LocalDate from, LocalDate to, Long accountId, Long partnerId,
                           Long departmentId, Long projectId, String currency, boolean includeStopped) {
        boolean detail = "DETAIL".equalsIgnoreCase(mode);
        List<JournalLine> lines = journalLineRepository.findForeignUntil(to).stream()
                .filter(l -> accountId == null || l.getAccount().getId().equals(accountId))
                .filter(l -> partnerId == null || (l.effectivePartner() != null && l.effectivePartner().getId().equals(partnerId)))
                .filter(l -> departmentId == null || departmentId.equals(l.getDepartmentId()))
                .filter(l -> projectId == null || projectId.equals(l.getProjectId()))
                .filter(l -> includeStopped || l.effectivePartner() == null || l.effectivePartner().isActive())
                .filter(l -> currency == null || currency.isBlank() || currency.equalsIgnoreCase(l.getCurrencyCode()))
                .toList();

        Map<String, List<JournalLine>> groups = new LinkedHashMap<>();
        for (JournalLine l : lines) groups.computeIfAbsent(key(l), k -> new ArrayList<>()).add(l);

        List<Row> rows = new ArrayList<>();
        Acc grand = new Acc();
        groups.values().stream()
                .sorted((a, b) -> key(a.get(0)).compareTo(key(b.get(0))))
                .forEach(g -> {
                    JournalLine head = g.get(0);
                    int sign = debitNormal(head) ? 1 : -1;
                    Acc acc = new Acc();
                    List<Row> detailRows = new ArrayList<>();
                    for (JournalLine l : g) {
                        BigDecimal fx = nz(l.getForeignAmount());
                        boolean isDebit = l.getDebit().signum() > 0;
                        BigDecimal fd = isDebit ? fx : BigDecimal.ZERO, fc = isDebit ? BigDecimal.ZERO : fx;
                        if (l.getEntry().getEntryDate().isBefore(from)) {
                            acc.fCarry = acc.fCarry.add(fd.subtract(fc).multiply(BigDecimal.valueOf(sign)));
                            acc.kCarry = acc.kCarry.add(l.getDebit().subtract(l.getCredit()).multiply(BigDecimal.valueOf(sign)));
                            continue;
                        }
                        acc.fd = acc.fd.add(fd); acc.fc = acc.fc.add(fc);
                        acc.kd = acc.kd.add(l.getDebit()); acc.kc = acc.kc.add(l.getCredit());
                        if (detail) {
                            BigDecimal fb = acc.fCarry.add(acc.fd.subtract(acc.fc).multiply(BigDecimal.valueOf(sign)));
                            BigDecimal kb = acc.kCarry.add(acc.kd.subtract(acc.kc).multiply(BigDecimal.valueOf(sign)));
                            detailRows.add(row("LINE", l, l.getEntry().getEntryDate(), l.getEntry().getDocNo(), l.getDescription(),
                                    null, fd, fc, fb, null, l.getDebit(), l.getCredit(), kb));
                        }
                    }
                    if (acc.empty()) return;
                    BigDecimal fb = acc.fCarry.add(acc.fd.subtract(acc.fc).multiply(BigDecimal.valueOf(sign)));
                    BigDecimal kb = acc.kCarry.add(acc.kd.subtract(acc.kc).multiply(BigDecimal.valueOf(sign)));
                    if (detail) {
                        rows.add(row("CARRY", head, null, null, "이월", null, null, null, acc.fCarry, null, null, null, acc.kCarry));
                        rows.addAll(detailRows);
                        rows.add(row("TOTAL", head, null, null, "계", null, acc.fd, acc.fc, fb, null, acc.kd, acc.kc, kb));
                    } else {
                        rows.add(row("LINE", head, null, null, null, acc.fCarry, acc.fd, acc.fc, fb, acc.kCarry, acc.kd, acc.kc, kb));
                    }
                    grand.kd = grand.kd.add(acc.kd); grand.kc = grand.kc.add(acc.kc);
                    grand.kCarry = grand.kCarry.add(acc.kCarry); grand.kBal = grand.kBal.add(kb);
                });
        if (!rows.isEmpty()) {
            rows.add(new Row("SUM", null, null, "합계", null, null, null, null, null, null, null,
                    null, null, null, null, grand.kCarry, grand.kd, grand.kc, grand.kBal));
        }
        return new Response(detail ? "DETAIL" : "PARTNER", from, to, rows);
    }

    private static Row row(String kind, JournalLine l, LocalDate date, String docNo, String desc,
                           BigDecimal fCarry, BigDecimal fd, BigDecimal fc, BigDecimal fb,
                           BigDecimal kCarry, BigDecimal kd, BigDecimal kc, BigDecimal kb) {
        BusinessPartner p = l.effectivePartner();
        return new Row(kind, date, docNo, desc,
                l.getAccount().getId(), l.getAccount().getCode(), l.getAccount().getName(),
                p != null ? p.getId() : null, p != null ? p.getCode() : null, p != null ? p.getName() : null,
                l.getCurrencyCode(), fCarry, fd, fc, fb, kCarry, kd, kc, kb);
    }

    private static String key(JournalLine l) {
        BusinessPartner p = l.effectivePartner();
        return (p != null ? p.getCode() : "") + "|" + l.getCurrencyCode() + "|" + l.getAccount().getCode();
    }

    private static boolean debitNormal(JournalLine l) {
        AccountDivision d = l.getAccount().getDivision();
        return d == AccountDivision.ASSET || d == AccountDivision.EXPENSE;
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }

    private static final class Acc {
        BigDecimal fCarry = BigDecimal.ZERO, fd = BigDecimal.ZERO, fc = BigDecimal.ZERO;
        BigDecimal kCarry = BigDecimal.ZERO, kd = BigDecimal.ZERO, kc = BigDecimal.ZERO, kBal = BigDecimal.ZERO;
        boolean empty() {
            return fCarry.signum() == 0 && fd.signum() == 0 && fc.signum() == 0
                    && kCarry.signum() == 0 && kd.signum() == 0 && kc.signum() == 0;
        }
    }
}
