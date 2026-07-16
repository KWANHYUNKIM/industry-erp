package com.erp.hr.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.domain.Employee;
import com.erp.hr.domain.EmploymentContract;
import com.erp.hr.domain.enums.ContractStatus;
import com.erp.hr.dto.EmploymentContractDtos.ContractResponse;
import com.erp.hr.dto.EmploymentContractDtos.CreateContractRequest;
import com.erp.hr.dto.EmploymentContractDtos.SignContractRequest;
import com.erp.hr.repository.EmploymentContractRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import com.erp.hr.dto.EmploymentContractDtos;

/** 전자근로계약: 작성 → 발송 → 서명. 서명된 계약은 근로조건의 확정 기록이라 수정하지 않는다. */
@Service
@RequiredArgsConstructor
public class EmploymentContractService {

    private final EmploymentContractRepository contractRepository;
    private final EmployeeService employeeService;
    private final DepartmentService departmentService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<ContractResponse> findAll() {
        return contractRepository.findAllWithRefs().stream()
                .map(ContractResponse::from)
                .toList();
    }

    @Transactional
    public ContractResponse create(CreateContractRequest req, String username) {
        Employee e = employeeService.get(req.employeeId());
        if (!e.isActive()) {
            throw ApiException.badRequest("퇴사한 사원과는 근로계약을 맺을 수 없습니다: " + e.getName());
        }
        if (req.type().requiresEndDate() && req.endDate() == null) {
            throw ApiException.badRequest(req.type().getDisplayName() + " 계약은 종료일이 있어야 합니다.");
        }
        if (req.endDate() != null && req.endDate().isBefore(req.startDate())) {
            throw ApiException.badRequest("계약 종료일이 시작일보다 앞설 수 없습니다.");
        }
        BigDecimal salary = req.monthlySalary() != null ? req.monthlySalary() : e.getBaseSalary();
        if (salary.signum() < 0) {
            throw ApiException.badRequest("급여는 0 이상이어야 합니다.");
        }
        int hours = req.weeklyHours() != null ? req.weeklyHours() : 40;
        if (hours <= 0 || hours > 52) {
            throw ApiException.badRequest("주당 근로시간은 1~52시간 사이여야 합니다.");
        }

        EmploymentContract c = EmploymentContract.builder()
                .contractNo(docNoGenerator.next("EC-", "employment_contracts", "contract_no", "start_date", req.startDate()))
                .employee(e)
                .type(req.type())
                .status(ContractStatus.DRAFT)
                .startDate(req.startDate())
                .endDate(req.endDate())
                // 계약 시점의 근로조건을 박아 둔다. 지정이 없으면 사원의 현재값을 복사한다.
                .department(req.departmentId() != null ? departmentService.get(req.departmentId()) : e.getDepartment())
                .jobTitle(req.jobTitle() != null && !req.jobTitle().isBlank() ? req.jobTitle().trim() : e.getJobTitle())
                .monthlySalary(salary)
                .weeklyHours(hours)
                .workPlace(req.workPlace())
                .duty(req.duty())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return ContractResponse.from(contractRepository.save(c));
    }

    /** 작성 → 발송 */
    @Transactional
    public ContractResponse send(Long id) {
        EmploymentContract c = get(id);
        if (c.getStatus() != ContractStatus.DRAFT) {
            throw ApiException.conflict("작성 상태의 계약만 발송할 수 있습니다. 현재: " + c.getStatus().getDisplayName());
        }
        c.setStatus(ContractStatus.SENT);
        return ContractResponse.from(c);
    }

    /**
     * 발송 → 서명완료. 같은 사원의 기간이 겹치는 다른 서명 계약이 있으면 거부한다.
     * (한 사람이 같은 기간에 두 개의 근로조건을 가질 수는 없다.)
     */
    @Transactional
    public ContractResponse sign(Long id, SignContractRequest req) {
        EmploymentContract c = get(id);
        if (c.getStatus() != ContractStatus.SENT) {
            throw ApiException.conflict("발송된 계약만 서명할 수 있습니다. 현재: " + c.getStatus().getDisplayName());
        }
        List<EmploymentContract> overlapping = c.getEndDate() == null
                ? contractRepository.findActiveFrom(
                        c.getEmployee().getId(), ContractStatus.SIGNED, c.getId(), c.getStartDate())
                : contractRepository.findOverlapping(
                        c.getEmployee().getId(), ContractStatus.SIGNED, c.getId(), c.getStartDate(), c.getEndDate());
        if (!overlapping.isEmpty()) {
            throw ApiException.conflict("계약기간이 겹치는 서명 계약이 있습니다: " + overlapping.get(0).getContractNo());
        }
        c.setStatus(ContractStatus.SIGNED);
        c.setSignedAt(LocalDateTime.now());
        c.setSignedBy(req.signedBy().trim());
        return ContractResponse.from(c);
    }

    /** 서명된 계약의 해지 */
    @Transactional
    public ContractResponse terminate(Long id) {
        EmploymentContract c = get(id);
        if (c.getStatus() != ContractStatus.SIGNED) {
            throw ApiException.conflict("서명완료된 계약만 해지할 수 있습니다. 현재: " + c.getStatus().getDisplayName());
        }
        c.setStatus(ContractStatus.TERMINATED);
        return ContractResponse.from(c);
    }

    /** 아직 서명되지 않은 계약만 삭제할 수 있다. 서명·해지된 계약은 기록으로 남는다. */
    @Transactional
    public void delete(Long id) {
        EmploymentContract c = get(id);
        if (c.getStatus() == ContractStatus.SIGNED || c.getStatus() == ContractStatus.TERMINATED) {
            throw ApiException.conflict("서명된 계약은 삭제할 수 없습니다. 해지 처리하세요.");
        }
        contractRepository.delete(c);
    }

    private EmploymentContract get(Long id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("근로계약을 찾을 수 없습니다. id=" + id));
    }
}
