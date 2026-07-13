package com.erp.controller;

import com.erp.common.ApiException;
import com.erp.domain.Employee;
import com.erp.repository.EmployeeRepository;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 사원 마스터. 급여관리 기초등록의 사원등록에 대응.
 * (HrController 의 /hr/employees 는 로그인 User 기반이라 별개다)
 */
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeRepository employeeRepository;

    @GetMapping
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        return employeeRepository.findByActiveTrueOrderByNameAsc().stream()
                .map(EmployeeController::toMap)
                .toList();
    }

    public record UpdateSalaryRequest(@NotNull(message = "기본급을 입력하세요.") BigDecimal baseSalary) {}

    /** 사원 기본급 수정 */
    @PutMapping("/{id}/base-salary")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    @Transactional
    public Map<String, Object> updateBaseSalary(@PathVariable Long id, @RequestBody UpdateSalaryRequest req) {
        Employee e = employeeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + id));
        if (req.baseSalary().signum() < 0) {
            throw ApiException.badRequest("기본급은 0 이상이어야 합니다.");
        }
        e.setBaseSalary(req.baseSalary());
        return toMap(e);
    }

    private static Map<String, Object> toMap(Employee e) {
        return Map.of(
                "id", e.getId(),
                "code", e.getCode(),
                "name", e.getName(),
                "department", e.getDepartment() != null ? e.getDepartment() : "",
                "jobTitle", e.getJobTitle() != null ? e.getJobTitle() : "",
                "baseSalary", e.getBaseSalary());
    }
}
