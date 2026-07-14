package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Employee;
import com.erp.dto.EmployeeDtos.AssignDepartmentRequest;
import com.erp.dto.EmployeeDtos.EmployeeResponse;
import com.erp.dto.EmployeeDtos.UpdateSalaryRequest;
import com.erp.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 사원 마스터. 급여관리 기초등록의 사원등록·부서 배치에 대응. */
@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final DepartmentService departmentService;

    @Transactional(readOnly = true)
    public List<EmployeeResponse> findAll() {
        return employeeRepository.findActiveWithDepartment().stream()
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

    private Employee get(Long id) {
        return employeeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + id));
    }
}
