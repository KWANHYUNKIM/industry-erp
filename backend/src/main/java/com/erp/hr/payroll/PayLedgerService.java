package com.erp.hr.payroll;

import com.erp.common.ApiException;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.payroll.dto.PayLedgerDtos.CalculateRequest;
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
    private final com.erp.hr.workrecord.WorkRecordService workRecordService;
    private final PayDirectAmountRepository directAmountRepository;

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
     * 재직 사원 모두 다시 셈한다. 확정된 명세가 하나라도 있으면 막는다.
     *
     * <p>원본 [개인별계산](2026-10-12 실측): 사원(퇴사자 포함) 목록에서 체크한 사원만 "선택한 사원의 기존 자료를
     * 삭제하고 다시 계산합니다." — 그 사원들의 명세만 지우고 다시 셈하고, 나머지 사원의 명세는 그대로 둔다.
     * 두 확인 창 모두 '지급총액 0 이하 제외'(처음 켬) — 끄면 0 이하 명세도 남긴다.
     */
    @Transactional
    public CalculateResult calculate(Long id, CalculateRequest req, String username) {
        PayLedger l = get(id);
        List<Long> picked = req == null || req.employeeIds() == null || req.employeeIds().isEmpty() ? null : req.employeeIds();
        boolean exclude = req == null || req.excludeNonPositive() == null || req.excludeNonPositive();
        List<Payslip> existing = payslipRepository.findByPayMonth(l.getPayMonth()).stream()
                .filter(p -> picked == null || picked.contains(p.getEmployee().getId()))
                .toList();
        if (existing.stream().anyMatch(p -> p.getStatus() == PayslipStatus.CONFIRMED)) {
            throw ApiException.badRequest("확정된 급여가 있어 다시 계산할 수 없습니다. 확정을 먼저 푸세요.");
        }
        payslipRepository.deleteAll(existing);
        payslipRepository.flush();
        var names = new java.util.HashMap<Long, String>();
        employeeService.findAllIncludingResigned().forEach(e -> names.put(e.id(), e.name()));
        List<Long> targets = picked != null ? picked : employeeService.findAll().stream().map(e -> e.id()).toList();
        int done = 0, skipped = 0;
        List<String> failures = new ArrayList<>();
        for (Long empId : targets) {
            try {
                PayslipResponse p = payrollService.create(
                        new CreatePayslipRequest(empId, l.getPayMonth(), null, null, null, null), username);
                if (exclude && (p.grossPay() == null || p.grossPay().signum() <= 0)) {
                    payrollService.delete(p.id());
                    skipped++;
                } else {
                    done++;
                }
            } catch (ApiException ex) {
                failures.add(names.getOrDefault(empId, "#" + empId) + "(" + ex.getMessage() + ")");
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
        workRecordService.deleteConfirms(l.getPayMonth());   // 대장의 근무기록확정도 함께
        directAmountRepository.deleteByPayMonth(l.getPayMonth());   // 금액직접입력도 함께
        ledgerRepository.delete(l);
    }

    // ── 원본 [사전작업] 금액직접입력(2026-10-12 실측) ──
    // 목록: 사원(퇴사자 포함)마다 손으로 정한 수당총액 · 공제총액. 사원번호를 누르면 '수당/공제 항목입력'
    // (기본급 · 수당항목 / 공제항목마다 금액 · 메모). 저장하면 그 대장을 다시 계산할 때 그 항목의 셈 대신 이 금액을 쓴다.

    @Transactional(readOnly = true)
    public List<com.erp.hr.payroll.dto.PayLedgerDtos.DirectAmountSummary> directSummary(Long id) {
        var byEmp = new java.util.LinkedHashMap<Long, BigDecimal[]>();
        for (PayDirectAmount d : directAmountRepository.findByPayMonth(get(id).getPayMonth())) {
            BigDecimal[] t = byEmp.computeIfAbsent(d.getEmployeeId(), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            int i = d.getKind() == PayslipLineKind.ALLOWANCE ? 0 : 1;
            t[i] = t[i].add(d.getAmount());
        }
        return byEmp.entrySet().stream()
                .map(e -> new com.erp.hr.payroll.dto.PayLedgerDtos.DirectAmountSummary(e.getKey(), e.getValue()[0], e.getValue()[1]))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<com.erp.hr.payroll.dto.PayLedgerDtos.DirectAmountCell> directCells(Long id, Long employeeId) {
        return directAmountRepository.findByPayMonthAndEmployeeId(get(id).getPayMonth(), employeeId).stream()
                .map(d -> new com.erp.hr.payroll.dto.PayLedgerDtos.DirectAmountCell(d.getKind(), d.getItemName(), d.getAmount(), d.getMemo()))
                .toList();
    }

    /** [저장(F8)] — 그 사원의 칸을 통째로 바꾼다. 금액이 빈 칸은 화면이 보내지 않는다. */
    @Transactional
    public void saveDirect(Long id, Long employeeId, com.erp.hr.payroll.dto.PayLedgerDtos.DirectAmountRequest req) {
        String month = get(id).getPayMonth();
        employeeService.findAllIncludingResigned().stream().filter(e -> e.id().equals(employeeId)).findFirst()
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + employeeId));
        directAmountRepository.deleteByPayMonthAndEmployeeId(month, employeeId);
        directAmountRepository.flush();
        var seen = new java.util.HashSet<String>();
        for (var c : req.cells() == null ? List.<com.erp.hr.payroll.dto.PayLedgerDtos.DirectAmountCell>of() : req.cells()) {
            if (!seen.add(c.kind() + "#" + c.itemName().trim())) continue;
            directAmountRepository.save(PayDirectAmount.builder().payMonth(month).employeeId(employeeId)
                    .kind(c.kind()).itemName(c.itemName().trim()).amount(c.amount())
                    .memo(c.memo() == null || c.memo().isBlank() ? null : c.memo().trim()).build());
        }
    }

    /** [삭제] · 목록 [선택삭제] — "한번 지워진 자료는 복구될 수 없습니다." */
    @Transactional
    public void deleteDirect(Long id, List<Long> employeeIds) {
        String month = get(id).getPayMonth();
        for (Long e : employeeIds) directAmountRepository.deleteByPayMonthAndEmployeeId(month, e);
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
        long workConfirmed = workRecordService.findConfirms(l.getPayMonth(), l.getPayMonth()).stream()
                .map(c -> c.employeeId()).distinct().count();
        long direct = directAmountRepository.findByPayMonth(l.getPayMonth()).stream()
                .map(PayDirectAmount::getEmployeeId).distinct().count();
        return new LedgerResponse(l.getId(), l.getPayMonth(), l.getName(), l.getPayDate(), slips.size(), gross, confirmed, workConfirmed, direct);
    }
}
