package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Employee;
import com.erp.domain.EmployeeAssignment;
import com.erp.domain.enums.AssignmentType;
import com.erp.dto.EmployeeDtos.AssignDepartmentRequest;
import com.erp.dto.EmployeeDtos.AssignmentResponse;
import com.erp.dto.EmployeeDtos.CreateAssignmentRequest;
import com.erp.dto.EmployeeDtos.EmployeeResponse;
import com.erp.dto.EmployeeDtos.UpdateSalaryRequest;
import com.erp.repository.EmployeeAssignmentRepository;
import com.erp.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 사원 마스터. 급여관리 기초등록(사원등록)과 인사관리(발령이력)에 대응. */
@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final EmployeeAssignmentRepository assignmentRepository;
    private final DepartmentService departmentService;

    /** 재직 중인 사원 (급여·조직도용) */
    @Transactional(readOnly = true)
    public List<EmployeeResponse> findAll() {
        return employeeRepository.findActiveWithDepartment().stream()
                .map(EmployeeResponse::from)
                .toList();
    }

    /** 퇴사자를 포함한 전 사원 (인사관리용) */
    @Transactional(readOnly = true)
    public List<EmployeeResponse> findAllIncludingResigned() {
        return employeeRepository.findAllWithDepartment().stream()
                .map(EmployeeResponse::from)
                .toList();
    }

    @Transactional
    public EmployeeResponse updateBaseSalary(Long id, UpdateSalaryRequest req) {
        if (req.baseSalary().signum() < 0) {
            throw ApiException.badRequest("기본급은 0 이상이어야 합니다.");
        }
        Employee e = get(id);
        e.setBaseSalary(req.baseSalary());
        return EmployeeResponse.from(e);
    }

    /** 부서 배치. departmentId 가 null 이면 미배치로 되돌린다. */
    @Transactional
    public EmployeeResponse assignDepartment(Long id, AssignDepartmentRequest req) {
        Employee e = get(id);
        e.setDepartment(req.departmentId() != null ? departmentService.get(req.departmentId()) : null);
        return EmployeeResponse.from(e);
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> findAssignments(Long employeeId) {
        get(employeeId);
        return assignmentRepository.findByEmployee(employeeId).stream()
                .map(AssignmentResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AssignmentResponse> findAllAssignments() {
        return assignmentRepository.findAllWithRefs().stream()
                .map(AssignmentResponse::from)
                .toList();
    }

    /**
     * 인사발령. 이력을 남기고 사원의 현재 상태(부서·직위·재직·입퇴사일)를 갱신한다.
     * 발령에서 지정하지 않은 부서·직위는 직전 값을 그대로 이어받는다.
     */
    @Transactional
    public AssignmentResponse createAssignment(Long employeeId, CreateAssignmentRequest req, String username) {
        Employee e = get(employeeId);

        switch (req.type()) {
            case TRANSFER -> {
                if (!e.isActive()) throw ApiException.badRequest("퇴사한 사원은 전보할 수 없습니다. 재입사 발령을 먼저 하세요.");
                if (req.departmentId() == null) throw ApiException.badRequest("전보 발령은 부서를 지정해야 합니다.");
                e.setDepartment(departmentService.get(req.departmentId()));
            }
            case PROMOTION -> {
                if (!e.isActive()) throw ApiException.badRequest("퇴사한 사원은 승진할 수 없습니다. 재입사 발령을 먼저 하세요.");
                if (req.jobTitle() == null || req.jobTitle().isBlank()) {
                    throw ApiException.badRequest("승진 발령은 직위를 지정해야 합니다.");
                }
                e.setJobTitle(req.jobTitle().trim());
                if (req.departmentId() != null) e.setDepartment(departmentService.get(req.departmentId()));
            }
            case RESIGN -> {
                if (!e.isActive()) throw ApiException.conflict("이미 퇴사한 사원입니다: " + e.getName());
                e.setActive(false);
                e.setResignDate(req.assignDate());
            }
            case HIRE, REHIRE -> {
                // 재입사는 퇴사자만. 입사는 퇴사자 외에, 입사일이 비어 있는 재직자의 기록 보정도 허용한다
                // (기존 사원 중 입사일이 없는 사람이 있고, 그걸 넣을 다른 경로가 없다).
                if (e.isActive()) {
                    if (req.type() == AssignmentType.REHIRE) {
                        throw ApiException.conflict("재직 중인 사원입니다: " + e.getName());
                    }
                    if (e.getHireDate() != null) {
                        throw ApiException.conflict("이미 입사일이 등록된 재직 사원입니다: " + e.getName());
                    }
                }
                e.setActive(true);
                e.setResignDate(null);
                if (req.type() == AssignmentType.HIRE) {
                    e.setHireDate(req.assignDate());
                }
                if (req.departmentId() != null) e.setDepartment(departmentService.get(req.departmentId()));
                if (req.jobTitle() != null && !req.jobTitle().isBlank()) e.setJobTitle(req.jobTitle().trim());
            }
        }

        EmployeeAssignment a = EmployeeAssignment.builder()
                .employee(e)
                .assignDate(req.assignDate())
                .type(req.type())
                // 발령에서 바뀌지 않은 항목은 사원의 현재값(= 직전 값)을 그대로 기록한다
                .department(e.getDepartment())
                .jobTitle(e.getJobTitle())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return AssignmentResponse.from(assignmentRepository.save(a));
    }

    private Employee get(Long id) {
        return employeeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + id));
    }
}
