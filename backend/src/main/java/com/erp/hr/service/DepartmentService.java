package com.erp.hr.service;

import com.erp.common.ApiException;
import com.erp.hr.domain.Department;
import com.erp.hr.dto.DepartmentDtos.CreateDepartmentRequest;
import com.erp.hr.dto.DepartmentDtos.DepartmentResponse;
import com.erp.hr.dto.DepartmentDtos.UpdateDepartmentRequest;
import com.erp.hr.repository.DepartmentRepository;
import com.erp.hr.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.hr.dto.DepartmentDtos;

/** 부서 마스터. 조직도 트리(자기참조)와 사원 배치의 규칙을 소유한다. */
@Service
@RequiredArgsConstructor
public class DepartmentService {

    private final DepartmentRepository departmentRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional(readOnly = true)
    public List<DepartmentResponse> findAll() {
        return departmentRepository.findAllWithParent().stream()
                .map(d -> DepartmentResponse.from(d, employeeRepository.countByDepartmentId(d.getId())))
                .toList();
    }

    @Transactional
    public DepartmentResponse create(CreateDepartmentRequest req) {
        String code = (req.code() == null || req.code().isBlank()) ? nextCode() : req.code().trim();
        if (departmentRepository.existsByCode(code)) {
            throw ApiException.conflict("이미 존재하는 부서코드입니다: " + code);
        }
        Department d = Department.builder()
                .code(code)
                .name(req.name().trim())
                .parent(req.parentId() != null ? get(req.parentId()) : null)
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(true)
                .build();
        return DepartmentResponse.from(departmentRepository.save(d), 0);
    }

    @Transactional
    public DepartmentResponse update(Long id, UpdateDepartmentRequest req) {
        Department d = get(id);
        Department parent = req.parentId() != null ? get(req.parentId()) : null;
        checkNoCycle(d, parent);

        d.setName(req.name().trim());
        d.setParent(parent);
        if (req.sortOrder() != null) d.setSortOrder(req.sortOrder());
        if (req.active() != null) d.setActive(req.active());
        return DepartmentResponse.from(d, employeeRepository.countByDepartmentId(d.getId()));
    }

    @Transactional
    public void delete(Long id) {
        Department d = get(id);
        if (departmentRepository.existsByParentId(id)) {
            throw ApiException.conflict("하위 부서가 있어 삭제할 수 없습니다. 하위 부서를 먼저 옮기세요.");
        }
        long employees = employeeRepository.countByDepartmentId(id);
        if (employees > 0) {
            throw ApiException.conflict("소속 사원이 " + employees + "명 있어 삭제할 수 없습니다. 사원을 먼저 옮기세요.");
        }
        departmentRepository.delete(d);
    }

    /** 다른 모듈(사원 배치 등)에서 부서 엔티티가 필요할 때 쓰는 진입점. */
    @Transactional(readOnly = true)
    public Department get(Long id) {
        return departmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("부서를 찾을 수 없습니다. id=" + id));
    }

    /**
     * 자기 자신이나 자기 하위 부서를 상위로 지정하면 트리가 사이클이 되어
     * 조직도 렌더링이 무한루프에 빠진다.
     */
    private void checkNoCycle(Department target, Department parent) {
        for (Department p = parent; p != null; p = p.getParent()) {
            if (p.getId().equals(target.getId())) {
                throw ApiException.badRequest("자기 자신이나 하위 부서를 상위 부서로 지정할 수 없습니다.");
            }
        }
    }

    private String nextCode() {
        long n = departmentRepository.count() + 1;
        String code = String.format("DEPT-%04d", n);
        while (departmentRepository.existsByCode(code)) {
            code = String.format("DEPT-%04d", ++n);
        }
        return code;
    }
}
