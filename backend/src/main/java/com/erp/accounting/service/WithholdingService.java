package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.hr.domain.Payslip;
import com.erp.hr.domain.PayslipLine;
import com.erp.hr.domain.PayslipLineKind;
import com.erp.hr.domain.PayslipStatus;
import com.erp.accounting.dto.WithholdingDtos.ReceiptMonth;
import com.erp.accounting.dto.WithholdingDtos.WithholdingReceipt;
import com.erp.accounting.dto.WithholdingDtos.WithholdingRow;
import com.erp.accounting.dto.WithholdingDtos.WithholdingStatement;
import com.erp.hr.repository.PayslipRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import com.erp.accounting.dto.WithholdingDtos;

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

        return new WithholdingStatement(
                month, rows.size(), draftCount,
                totalGross, totalIncomeTax, totalLocal, totalIncomeTax.add(totalLocal),
                rows);
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
