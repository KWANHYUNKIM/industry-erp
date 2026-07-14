package com.erp.controller;

import com.erp.dto.EmployeeDtos.AssignDepartmentRequest;
import com.erp.dto.EmployeeDtos.EmployeeResponse;
import com.erp.dto.EmployeeDtos.UpdateSalaryRequest;
import com.erp.service.EmployeeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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

    @GetMapping
    public List<EmployeeResponse> list() {
        return employeeService.findAll();
    }

    /** 사원 기본급 수정 */
    @PutMapping("/{id}/base-salary")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public EmployeeResponse updateBaseSalary(@PathVariable Long id, @Valid @RequestBody UpdateSalaryRequest req) {
        return employeeService.updateBaseSalary(id, req);
    }

    /** 부서 배치 (조직도에서 사원을 부서로 옮길 때) */
    @PutMapping("/{id}/department")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public EmployeeResponse assignDepartment(@PathVariable Long id, @RequestBody AssignDepartmentRequest req) {
        return employeeService.assignDepartment(id, req);
    }
}
