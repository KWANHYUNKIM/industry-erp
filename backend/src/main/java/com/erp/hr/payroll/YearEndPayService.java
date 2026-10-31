package com.erp.hr.payroll;

import com.erp.accounting.tax.withholding.WithholdingService;
import com.erp.accounting.tax.yearend.TaxSettlementService;
import com.erp.accounting.tax.yearend.dto.TaxSettlementDtos.CurrentPay;
import com.erp.accounting.tax.yearend.dto.TaxSettlementDtos.SettlementResponse;
import com.erp.accounting.tax.yearend.TaxSettlementKind;
import com.erp.common.ApiException;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.employee.dto.EmployeeDtos.EmployeeResponse;
import com.erp.hr.payroll.dto.YearEndDtos.Candidate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.Collator;
import java.util.Collection;
import java.util.Comparator;
import java.util.Locale;
import java.util.List;
import java.util.Set;

/**
 * 연말정산 · 중도정산 [계산처리] 의 hr 몫 — 사원의 귀속연도 <b>확정</b> 급여명세에서 주(현)근무지 한 해 급여를 모아
 * accounting 의 {@link TaxSettlementService#calculate} 로 넣는다. hr → accounting 은 허용 간선(CLAUDE.md 4.1)이라
 * accounting 이 급여명세를 다시 읽지 않게 이쪽이 센다.
 *
 * <p>비과세는 <b>한도 안의</b> 몫만(지급총액 − 급여계산의 과세급여) — 식대 · 차량유지비 · 보육수당 월 200,000 을 넘는 몫은 총급여에 남는다.
 */
@Service
@RequiredArgsConstructor
public class YearEndPayService {

    private static final Set<String> HEALTH = Set.of("건강보험", "장기요양보험");

    private final PayslipRepository payslipRepository;
    private final PayrollService payrollService;
    private final TaxSettlementService taxSettlementService;
    private final EmployeeService employeeService;

    /**
     * 대상자추가 창의 후보 — 원본(plans/세무/연말정산.md 2장 · E030114.md 2장):
     * 연말정산 = 재직 사원(+ [퇴직자 포함] 이면 귀속연도 퇴사자), 중도정산 = 귀속연도 퇴사자. 이미 그 해 정산이 있는 사람은 뺀다.
     * 성명 가나다 차례(원본 고준희 · 김기현 · 김동건 …). 주민번호 잠금은 넣지 않는다(우리 사원에 주민번호 칸 없음 — 사용자 결정 대기).
     */
    @Transactional(readOnly = true)
    public List<Candidate> candidates(int year, TaxSettlementKind kind, boolean includeRetired) {
        Set<Long> existing = taxSettlementService.employeeIds(year, kind);
        Collator ko = Collator.getInstance(Locale.KOREAN);
        return employeeService.findAllIncludingResigned().stream()
                .filter(e -> !existing.contains(e.id()))
                .filter(e -> {
                    boolean retiredInYear = !e.active() && e.resignDate() != null && e.resignDate().getYear() == year;
                    if (kind == TaxSettlementKind.MID_TERM) return retiredInYear;
                    return e.active() || (includeRetired && retiredInYear);
                })
                .sorted(Comparator.comparing(EmployeeResponse::name, ko))
                .map(e -> new Candidate(e.id(), e.code(), e.name(), e.resignDate()))
                .toList();
    }

    /** 목록 [계산처리] — 고른 정산마다 한 해 급여를 다시 모아 계산한다. */
    @Transactional
    public List<SettlementResponse> calculate(Collection<Long> settlementIds) {
        if (settlementIds == null || settlementIds.isEmpty()) throw ApiException.badRequest("계산처리할 사원이 선택되지 않았습니다.");
        return settlementIds.stream().map(id -> {
            SettlementResponse s = taxSettlementService.find(id);
            return taxSettlementService.calculate(id, annualPay(s.employeeId(), s.attributionYear()));
        }).toList();
    }

    /** 사원 한 사람의 귀속연도 확정 급여명세 합. */
    @Transactional(readOnly = true)
    public CurrentPay annualPay(Long employeeId, int year) {
        BigDecimal total = BigDecimal.ZERO, taxable = BigDecimal.ZERO, pension = BigDecimal.ZERO, health = BigDecimal.ZERO,
                employment = BigDecimal.ZERO, tax = BigDecimal.ZERO, local = BigDecimal.ZERO;
        for (Payslip p : payslipRepository.findByYear(String.valueOf(year))) {
            if (p.getStatus() != PayslipStatus.CONFIRMED || !p.getEmployee().getId().equals(employeeId)) continue;
            total = total.add(p.grossPay());
            taxable = taxable.add(payrollService.taxablePay(p));
            for (PayslipLine l : p.getLines()) {
                if (l.getKind() != PayslipLineKind.DEDUCTION) continue;
                String n = l.getName();
                if ("국민연금".equals(n)) pension = pension.add(l.getAmount());
                else if (HEALTH.contains(n)) health = health.add(l.getAmount());
                else if ("고용보험".equals(n)) employment = employment.add(l.getAmount());
                else if (WithholdingService.INCOME_TAX.equals(n)) tax = tax.add(l.getAmount());
                else if (WithholdingService.LOCAL_INCOME_TAX.equals(n)) local = local.add(l.getAmount());
            }
        }
        return new CurrentPay(total.longValue(), total.subtract(taxable).max(BigDecimal.ZERO).longValue(), pension.longValue(),
                health.longValue(), employment.longValue(), tax.longValue(), local.longValue());
    }
}
