package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Employee;
import com.erp.domain.Payslip;
import com.erp.domain.PayslipLine;
import com.erp.domain.PayslipLineKind;
import com.erp.domain.PayslipStatus;
import com.erp.dto.PayrollDtos.CreatePayslipRequest;
import com.erp.dto.PayrollDtos.LineInput;
import com.erp.dto.PayrollDtos.PayslipResponse;
import com.erp.repository.EmployeeRepository;
import com.erp.repository.PayslipRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 급여관리: 급여명세 생성(4대보험 자동공제), 급여대장 조회, 확정.
 *
 * 4대보험 근로자 부담 요율(2026 기준). 소득세·지방소득세는 간이세액표가 필요하므로
 * 이 데모에서는 자동 공제하지 않고 수동 항목으로 입력한다.
 */
@Service
@RequiredArgsConstructor
public class PayrollService {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");

    // 근로자 부담 요율. 과세소득(기본급+과세수당) 기준. 여기서는 지급총액을 과세소득으로 본다.
    private static final BigDecimal NATIONAL_PENSION = new BigDecimal("0.045");   // 국민연금 4.5%
    private static final BigDecimal HEALTH          = new BigDecimal("0.03545");  // 건강보험 3.545%
    private static final BigDecimal LONG_TERM_CARE  = new BigDecimal("0.1295");   // 장기요양 = 건강보험료의 12.95%
    private static final BigDecimal EMPLOYMENT       = new BigDecimal("0.009");    // 고용보험 0.9%

    private final PayslipRepository payslipRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional(readOnly = true)
    public List<PayslipResponse> payroll(String month) {
        return payslipRepository.findByPayMonth(month).stream()
                .map(PayslipResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public PayslipResponse get(Long id) {
        return PayslipResponse.from(getPayslip(id));
    }

    /** 급여명세 생성. 기본급+수당을 과세소득으로 보고 4대보험을 자동 공제한다. */
    @Transactional
    public PayslipResponse create(CreatePayslipRequest req, String username) {
        if (!MONTH.matcher(req.payMonth()).matches()) {
            throw ApiException.badRequest("귀속월 형식이 올바르지 않습니다(YYYY-MM): " + req.payMonth());
        }
        Employee emp = employeeRepository.findById(req.employeeId())
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + req.employeeId()));
        if (payslipRepository.existsByEmployee_IdAndPayMonth(emp.getId(), req.payMonth())) {
            throw ApiException.conflict(emp.getName() + "의 " + req.payMonth() + " 급여명세가 이미 있습니다.");
        }

        BigDecimal baseSalary = req.baseSalary() != null ? req.baseSalary() : emp.getBaseSalary();
        Payslip p = Payslip.builder()
                .employee(emp)
                .payMonth(req.payMonth())
                .baseSalary(baseSalary)
                .status(PayslipStatus.DRAFT)
                .remark(req.remark())
                .createdBy(username)
                .build();

        // 1) 사용자 입력 수당·수동공제
        if (req.lines() != null) {
            for (LineInput in : req.lines()) {
                if (in.amount() == null || in.amount().signum() < 0) {
                    throw ApiException.badRequest("금액은 0 이상이어야 합니다: " + in.name());
                }
                p.addLine(PayslipLine.builder()
                        .kind(in.kind()).name(in.name()).amount(in.amount()).auto(false).build());
            }
        }

        // 2) 4대보험 자동 공제 (과세소득 = 기본급 + 수당합)
        BigDecimal taxableIncome = baseSalary.add(p.getLines().stream()
                .filter(l -> l.getKind() == PayslipLineKind.ALLOWANCE)
                .map(PayslipLine::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));

        BigDecimal pension = round(taxableIncome.multiply(NATIONAL_PENSION));
        BigDecimal health = round(taxableIncome.multiply(HEALTH));
        BigDecimal care = round(health.multiply(LONG_TERM_CARE));   // 장기요양은 건강보험료 기준
        BigDecimal employment = round(taxableIncome.multiply(EMPLOYMENT));

        addAutoDeduction(p, "국민연금", pension);
        addAutoDeduction(p, "건강보험", health);
        addAutoDeduction(p, "장기요양보험", care);
        addAutoDeduction(p, "고용보험", employment);

        p.recalculate();
        return PayslipResponse.from(payslipRepository.save(p));
    }

    @Transactional
    public PayslipResponse confirm(Long id) {
        Payslip p = getPayslip(id);
        if (p.getStatus() == PayslipStatus.CONFIRMED) {
            throw ApiException.badRequest("이미 확정된 급여명세입니다.");
        }
        p.setStatus(PayslipStatus.CONFIRMED);
        return PayslipResponse.from(p);
    }

    @Transactional
    public void delete(Long id) {
        Payslip p = getPayslip(id);
        if (p.getStatus() == PayslipStatus.CONFIRMED) {
            throw ApiException.badRequest("확정된 급여명세는 삭제할 수 없습니다.");
        }
        payslipRepository.delete(p);
    }

    private void addAutoDeduction(Payslip p, String name, BigDecimal amount) {
        if (amount.signum() <= 0) return;
        p.addLine(PayslipLine.builder()
                .kind(PayslipLineKind.DEDUCTION).name(name).amount(amount).auto(true).build());
    }

    private BigDecimal round(BigDecimal v) {
        // 원 단위 절사(10원 미만 버림은 회사 정책마다 다르므로 원 단위 반올림으로 단순화)
        return v.setScale(0, RoundingMode.HALF_UP);
    }

    private Payslip getPayslip(Long id) {
        return payslipRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("급여명세를 찾을 수 없습니다. id=" + id));
    }
}
