package com.erp.hr.payroll;

import com.erp.common.ApiException;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.payroll.dto.PayLedgerDtos.CalculateResult;
import com.erp.hr.payroll.dto.PayLedgerDtos.CreateLedgerRequest;
import com.erp.hr.payroll.dto.PayLedgerDtos.LedgerResponse;
import com.erp.hr.payroll.dto.PayrollDtos.CreatePayslipRequest;
import com.erp.hr.payroll.dto.PayrollDtos.PayslipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 급여계산/대장(E090106). 대장을 만들고 [전체계산]으로 재직 사원 모두의 급여명세를 다시 셈하고,
 * [확정] · [삭제] 를 대장 단위로 한다. 명세 한 장의 셈은 {@link PayrollService#create} 그대로다.
 */
@Service
@RequiredArgsConstructor
public class PayLedgerService {

    private final PayLedgerRepository ledgerRepository;
    private final PayslipRepository payslipRepository;
    private final PayrollService payrollService;
    private final EmployeeService employeeService;

    @Transactional(readOnly = true)
    public List<LedgerResponse> findAll() {
        return ledgerRepository.findAllByOrderByPayMonthDesc().stream().map(this::toResponse).toList();
    }

    /** 원본은 같은 기간 대장이 있으면 묻고 하나 더 만든다 — 우리는 귀속월에 하나라 거절한다. */
    @Transactional
    public LedgerResponse create(CreateLedgerRequest req, String username) {
        if (ledgerRepository.findByPayMonth(req.payMonth()).isPresent()) {
            throw ApiException.conflict("동일기간에 이미 생성된 급여가 있습니다: " + req.payMonth().replace('-', '/'));
        }
        PayLedger l = PayLedger.builder()
                .payMonth(req.payMonth())
                .name(req.name() == null || req.name().isBlank() ? req.payMonth().replace('-', '/') + " 급여" : req.name().trim())
                .payDate(req.payDate() != null ? req.payDate() : LocalDate.now())
                .createdBy(username)
                .build();
        return toResponse(ledgerRepository.save(l));
    }

    /**
     * 원본 [전체계산]: "기존 자료를 삭제하고 다시 계산합니다." — 그 귀속월의 미확정 명세를 지우고
     * 재직 사원 모두 다시 셈한다. 확정된 명세가 하나라도 있으면 막는다. 지급총액 0 이하는 뺀다.
     */
    @Transactional
    public CalculateResult calculate(Long id, String username) {
        PayLedger l = get(id);
        List<Payslip> existing = payslipRepository.findByPayMonth(l.getPayMonth());
        if (existing.stream().anyMatch(p -> p.getStatus() == PayslipStatus.CONFIRMED)) {
            throw ApiException.badRequest("확정된 급여가 있어 다시 계산할 수 없습니다. 확정을 먼저 푸세요.");
        }
        payslipRepository.deleteAll(existing);
        payslipRepository.flush();
        int done = 0, skipped = 0;
        List<String> failures = new ArrayList<>();
        for (var e : employeeService.findAll()) {
            try {
                PayslipResponse p = payrollService.create(
                        new CreatePayslipRequest(e.id(), l.getPayMonth(), null, null, null, null), username);
                if (p.grossPay() == null || p.grossPay().signum() <= 0) {
                    payrollService.delete(p.id());
                    skipped++;
                } else {
                    done++;
                }
            } catch (ApiException ex) {
                failures.add(e.name() + "(" + ex.getMessage() + ")");
            }
        }
        return new CalculateResult(done, skipped, String.join(", ", failures));
    }

    /** 원본 [확정] — 대장의 미확정 명세를 모두 확정한다. */
    @Transactional
    public LedgerResponse confirm(Long id) {
        PayLedger l = get(id);
        for (Payslip p : payslipRepository.findByPayMonth(l.getPayMonth())) {
            if (p.getStatus() != PayslipStatus.CONFIRMED) p.setStatus(PayslipStatus.CONFIRMED);
        }
        return toResponse(l);
    }

    /** 원본 [삭제]: "급여가 전체 삭제됩니다. 삭제된 급여는 복구할 수 없습니다." — 확정분이 있으면 막는다. */
    @Transactional
    public void delete(Long id) {
        PayLedger l = get(id);
        List<Payslip> slips = payslipRepository.findByPayMonth(l.getPayMonth());
        if (slips.stream().anyMatch(p -> p.getStatus() == PayslipStatus.CONFIRMED)) {
            throw ApiException.badRequest("확정된 급여는 삭제할 수 없습니다.");
        }
        payslipRepository.deleteAll(slips);
        ledgerRepository.delete(l);
    }

    private PayLedger get(Long id) {
        return ledgerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("급여대장을 찾을 수 없습니다. id=" + id));
    }

    private LedgerResponse toResponse(PayLedger l) {
        List<Payslip> slips = payslipRepository.findByPayMonth(l.getPayMonth());
        BigDecimal gross = slips.stream()
                .map(p -> p.getBaseSalary().add(p.getAllowanceTotal()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long confirmed = slips.stream().filter(p -> p.getStatus() == PayslipStatus.CONFIRMED).count();
        return new LedgerResponse(l.getId(), l.getPayMonth(), l.getName(), l.getPayDate(), slips.size(), gross, confirmed);
    }
}
