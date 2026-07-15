package com.erp.controller;

import com.erp.dto.EmployeeDtos.AssignDepartmentRequest;
import com.erp.dto.EmployeeDtos.AssignmentResponse;
import com.erp.dto.EmployeeDtos.CreateAssignmentRequest;
import com.erp.dto.EmployeeDtos.EmployeeResponse;
import com.erp.dto.EmployeeDtos.UpdateSalaryRequest;
import com.erp.dto.EmployeePerformanceDtos.PerformanceSummary;
import com.erp.security.UserPrincipal;
import com.erp.service.EmployeePerformanceService;
import com.erp.service.EmployeeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;

/**
 * 사원 마스터. 급여관리 기초등록의 사원등록에 대응.
 * (HrController 의 /hr/employees 는 로그인 User 기반이라 별개다)
 */
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;
    private final EmployeePerformanceService performanceService;

    /** 담당자별 실적: 전표에 붙은 담당 사원으로 판매·구매를 집계한다(입력 계정이 아니다). */
    @GetMapping("/performance")
    public PerformanceSummary performance(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return performanceService.performance(from, to);
    }

    @GetMapping
    public List<EmployeeResponse> list() {
        return employeeService.findAll();
    }

    /** 퇴사자를 포함한 전 사원 (인사관리) */
    @GetMapping("/all")
    public List<EmployeeResponse> listAll() {
        return employeeService.findAllIncludingResigned();
    }

    /** 사원별 발령이력 */
    @GetMapping("/{id}/assignments")
    public List<AssignmentResponse> assignments(@PathVariable Long id) {
        return employeeService.findAssignments(id);
    }

    /** 인사발령 (입사·전보·승진·퇴사·재입사). 사원의 현재 부서·직위·재직상태가 함께 갱신된다. */
    @PostMapping("/{id}/assignments")
    public AssignmentResponse assign(@PathVariable Long id,
                                     @Valid @RequestBody CreateAssignmentRequest req,
                                     @AuthenticationPrincipal UserPrincipal principal) {
        return employeeService.createAssignment(id, req, principal.getUsername());
    }

    /** 사원 기본급 수정 */
    @PutMapping("/{id}/base-salary")
    public EmployeeResponse updateBaseSalary(@PathVariable Long id, @Valid @RequestBody UpdateSalaryRequest req) {
        return employeeService.updateBaseSalary(id, req);
    }

    /** 부서 배치 (조직도에서 사원을 부서로 옮길 때) */
    @PutMapping("/{id}/department")
    public EmployeeResponse assignDepartment(@PathVariable Long id, @RequestBody AssignDepartmentRequest req) {
        return employeeService.assignDepartment(id, req);
    }
}
