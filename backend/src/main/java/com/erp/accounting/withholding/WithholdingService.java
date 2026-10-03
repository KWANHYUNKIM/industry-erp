package com.erp.accounting.withholding;

import com.erp.common.ApiException;
import com.erp.hr.payroll.Payslip;
import com.erp.hr.payroll.PayslipLine;
import com.erp.hr.payroll.PayslipLineKind;
import com.erp.hr.payroll.PayslipStatus;
import com.erp.accounting.withholding.dto.WithholdingDtos.ReceiptMonth;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReceipt;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingRow;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingStatement;
import com.erp.hr.payroll.PayslipRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import com.erp.accounting.withholding.dto.WithholdingDtos;

/**
 * 원천징수: 급여에서 뗀 소득세·지방소득세를 신고 단위로 집계한다.
 *
 * 세액 자체는 급여명세를 만들 때 PayrollService 가 이미 공제해 뒀다. 여기서는 그 공제 항목을
 * 신고서 모양(월별 이행상황 / 사원별 연간 영수증)으로 다시 묶기만 한다. 집계가 세액을 다시
 * 계산하지 않으므로, 급여명세에서 소득세를 손으로 고친 경우에도 신고액과 실제 공제액이 어긋나지 않는다.
 *
 * 신고 대상은 확정(CONFIRMED)된 급여명세뿐이다. 작성 중인 명세는 건수만 알린다.
 */
@Service
@RequiredArgsConstructor
public class WithholdingService {

    // hr(PayrollService)에서 원천징수 공제 항목명으로 참조 → 모듈 경계를 넘으므로 public.
    public static final String INCOME_TAX = "소득세";
    public static final String LOCAL_INCOME_TAX = "지방소득세";
    /** 원천징수 대상이 아닌 공제(4대보험). 영수증의 사회보험료 칸에 따로 싣는다. */
    private static final Set<String> SOCIAL_INSURANCE =
            Set.of("국민연금", "건강보험", "장기요양보험", "고용보험");

    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");

    private final PayslipRepository payslipRepository;
    private final com.erp.hr.dailywork.DailyWorkService dailyWorkService;
    private final com.erp.accounting.otherwithholding.OtherWithholdingRepository otherWithholdingRepository;

    /** 원천징수이행상황신고서 (귀속월 기준) */
    @Transactional(readOnly = true)
    public WithholdingStatement statement(String month) {
        if (month == null || !MONTH.matcher(month).matches()) {
            throw ApiException.badRequest("귀속월 형식이 올바르지 않습니다(YYYY-MM): " + month);
        }
        List<Payslip> all = payslipRepository.findByPayMonth(month);

        List<WithholdingRow> rows = new ArrayList<>();
        BigDecimal totalGross = BigDecimal.ZERO;
        BigDecimal totalIncomeTax = BigDecimal.ZERO;
        BigDecimal totalLocal = BigDecimal.ZERO;
        int draftCount = 0;

        for (Payslip p : all) {
            if (p.getStatus() != PayslipStatus.CONFIRMED) {
                draftCount++;
                continue;
            }
            BigDecimal incomeTax = deduction(p, INCOME_TAX);
            BigDecimal local = deduction(p, LOCAL_INCOME_TAX);
            BigDecimal gross = p.grossPay();

            rows.add(new WithholdingRow(
                    p.getId(), p.getEmployee().getId(), p.getEmployee().getCode(), p.getEmployee().getName(),
                    gross, incomeTax, local, incomeTax.add(local)));

            totalGross = totalGross.add(gross);
            totalIncomeTax = totalIncomeTax.add(incomeTax);
            totalLocal = totalLocal.add(local);
        }

        List<WithholdingDtos.IncomeSection> sections = new ArrayList<>();
        sections.add(new WithholdingDtos.IncomeSection("A01", "근로소득(간이세액)", rows.size(), totalGross, totalIncomeTax, totalLocal));
        java.time.YearMonth ym = java.time.YearMonth.parse(month);
        var daily = dailyWorkService.monthTotals(ym);
        if (daily.count() > 0) {
            sections.add(new WithholdingDtos.IncomeSection("A03", "일용근로", daily.count(), daily.wage(),
                    daily.incomeTax(), daily.localIncomeTax()));
        }
        java.util.Map<com.erp.accounting.income.IncomeType, List<com.erp.accounting.otherwithholding.OtherWithholding>> byType =
                otherWithholdingRepository.findBetween(ym.atDay(1), ym.atEndOfMonth()).stream()
                        .collect(java.util.stream.Collectors.groupingBy(com.erp.accounting.otherwithholding.OtherWithholding::getIncomeType,
                                java.util.TreeMap::new, java.util.stream.Collectors.toList()));
        byType.forEach((type, list) -> sections.add(new WithholdingDtos.IncomeSection(
                formCode(type), type.getDisplayName(), list.size(),
                list.stream().map(com.erp.accounting.otherwithholding.OtherWithholding::getGrossAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                list.stream().map(com.erp.accounting.otherwithholding.OtherWithholding::getIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add),
                list.stream().map(com.erp.accounting.otherwithholding.OtherWithholding::getLocalIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add))));
        BigDecimal grandTax = sections.stream().map(WithholdingDtos.IncomeSection::incomeTax).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal grandLocal = sections.stream().map(WithholdingDtos.IncomeSection::localIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add);

        return new WithholdingStatement(
                month, rows.size(), draftCount,
                totalGross, totalIncomeTax, totalLocal, totalIncomeTax.add(totalLocal),
                rows, sections, grandTax, grandLocal, grandTax.add(grandLocal));
    }

    /**
     * 신고서 서식의 코드 — 원본 신고서는 기타원천세를 사업소득 [매월징수 A25] · 기타소득 [그 외 A42] ·
     * 이자 [A50] · 배당 [A60] 줄에 싣는다. 예전엔 enum 이름(BUSINESS …)을 코드로 내보내 서식 줄과 이을 수 없었다.
     */
    static String formCode(com.erp.accounting.income.IncomeType type) {
        return switch (type) {
            case BUSINESS -> "A25";
            case OTHER -> "A42";
            case INTEREST -> "A50";
            case DIVIDEND -> "A60";
        };
    }

    /**
     * 원천징수부(E020116) — 기준연월의 연도 1월부터 기준연월까지, 사원마다 달별 총급여(과세) · 비과세 · 소득세 · 지방소득세.
     * 확정 명세만 센다. 원본은 기준연월 2026/10 이면 2026.01 ~ 2026.10 을 찍고 11 · 12 칸은 비운다.
     */
    @Transactional(readOnly = true)
    public List<WithholdingDtos.LedgerEmployee> ledger(String month) {
        if (month == null || !MONTH.matcher(month).matches()) {
            throw ApiException.badRequest("기준연월 형식이 올바르지 않습니다(YYYY-MM): " + month);
        }
        return ledger(month.substring(0, 4) + "-01", month);
    }

    /**
     * 기간판 — 소득세확인서(E030103)의 [조회일자] 처럼 해를 넘길 수 있다. from ~ to (YYYY-MM, 양끝 포함).
     */
    @Transactional(readOnly = true)
    public List<WithholdingDtos.LedgerEmployee> ledger(String from, String to) {
        if (from == null || !MONTH.matcher(from).matches() || to == null || !MONTH.matcher(to).matches()) {
            throw ApiException.badRequest("조회일자 형식이 올바르지 않습니다(YYYY-MM): " + from + " ~ " + to);
        }
        if (from.compareTo(to) > 0) {
            throw ApiException.badRequest("조회일자의 시작이 끝보다 늦습니다: " + from + " ~ " + to);
        }
        java.util.Map<Long, List<Payslip>> byEmployee = new java.util.LinkedHashMap<>();
        for (int y = Integer.parseInt(from.substring(0, 4)); y <= Integer.parseInt(to.substring(0, 4)); y++) {
            for (Payslip p : payslipRepository.findByYear(String.valueOf(y))) {
                if (p.getStatus() != PayslipStatus.CONFIRMED
                        || p.getPayMonth().compareTo(from) < 0 || p.getPayMonth().compareTo(to) > 0) continue;
                byEmployee.computeIfAbsent(p.getEmployee().getId(), k -> new ArrayList<>()).add(p);
            }
        }
        List<WithholdingDtos.LedgerEmployee> out = new ArrayList<>();
        for (List<Payslip> slips : byEmployee.values()) {
            var e = slips.get(0).getEmployee();
            List<WithholdingDtos.LedgerMonth> months = slips.stream()
                    .sorted(java.util.Comparator.comparing(Payslip::getPayMonth))
                    .map(p -> {
                        BigDecimal nonTaxable = p.getLines().stream()
                                .filter(l -> l.getKind() == PayslipLineKind.ALLOWANCE && !l.isTaxable())
                                .map(PayslipLine::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
                        return new WithholdingDtos.LedgerMonth(p.getPayMonth(), p.grossPay().subtract(nonTaxable), nonTaxable,
                                deduction(p, INCOME_TAX), deduction(p, LOCAL_INCOME_TAX));
                    })
                    .toList();
            out.add(new WithholdingDtos.LedgerEmployee(e.getId(), e.getCode(), e.getName(),
                    e.getHireDate(), e.getResignDate(), months));
        }
        out.sort(java.util.Comparator.comparing(WithholdingDtos.LedgerEmployee::employeeCode,
                java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())));
        return out;
    }

    /** 근로소득 원천징수영수증 (연간, 사원별). 확정 명세만 집계한다. */
    @Transactional(readOnly = true)
    public List<WithholdingReceipt> receipts(int year) {
        List<Payslip> all = payslipRepository.findByYear(String.valueOf(year));

        List<WithholdingReceipt> receipts = new ArrayList<>();
        Long currentEmployeeId = null;
        List<Payslip> bucket = new ArrayList<>();

        for (Payslip p : all) {
            if (p.getStatus() != PayslipStatus.CONFIRMED) continue;
            Long empId = p.getEmployee().getId();
            if (currentEmployeeId != null && !currentEmployeeId.equals(empId)) {
                receipts.add(toReceipt(year, bucket));
                bucket = new ArrayList<>();
            }
            currentEmployeeId = empId;
            bucket.add(p);
        }
        if (!bucket.isEmpty()) {
            receipts.add(toReceipt(year, bucket));
        }
        return receipts;
    }

    private WithholdingReceipt toReceipt(int year, List<Payslip> slips) {
        Payslip first = slips.get(0);
        BigDecimal gross = BigDecimal.ZERO;
        BigDecimal incomeTax = BigDecimal.ZERO;
        BigDecimal local = BigDecimal.ZERO;
        BigDecimal social = BigDecimal.ZERO;
        List<ReceiptMonth> months = new ArrayList<>();

        for (Payslip p : slips) {
            BigDecimal g = p.grossPay();
            BigDecimal it = deduction(p, INCOME_TAX);
            BigDecimal lt = deduction(p, LOCAL_INCOME_TAX);

            months.add(new ReceiptMonth(p.getPayMonth(), g, it, lt));
            gross = gross.add(g);
            incomeTax = incomeTax.add(it);
            local = local.add(lt);
            social = social.add(sumDeductions(p, SOCIAL_INSURANCE));
        }

        return new WithholdingReceipt(
                year,
                first.getEmployee().getId(), first.getEmployee().getCode(), first.getEmployee().getName(),
                gross, incomeTax, local, incomeTax.add(local), social,
                months);
    }

    private BigDecimal deduction(Payslip p, String name) {
        return sumDeductions(p, Set.of(name));
    }

    private BigDecimal sumDeductions(Payslip p, Set<String> names) {
        return p.getLines().stream()
                .filter(l -> l.getKind() == PayslipLineKind.DEDUCTION)
                .filter(l -> names.contains(l.getName()))
                .map(PayslipLine::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
