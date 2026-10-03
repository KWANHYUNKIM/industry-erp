package com.erp.hr.department;

import com.erp.hr.department.dto.DepartmentDtos.CreateDepartmentRequest;
import com.erp.hr.department.dto.DepartmentDtos.DepartmentResponse;
import com.erp.hr.department.dto.DepartmentDtos.UpdateDepartmentRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.hr.department.dto.DepartmentDtos;

@RestController
@RequestMapping("/api/departments")
@RequiredArgsConstructor
public class DepartmentController {

    private final DepartmentService departmentService;

    @GetMapping
    public List<DepartmentResponse> list() {
        return departmentService.findAll();
    }

    /** 원본 부서등록 창이 미리 채우는 다음 부서코드(00010 꼴). */
    @GetMapping("/next-code")
    public java.util.Map<String, String> nextCode() {
        return java.util.Map.of("code", departmentService.nextCode());
    }

    @PostMapping
    public ResponseEntity<DepartmentResponse> create(@Valid @RequestBody CreateDepartmentRequest req) {
        return ResponseEntity.ok(departmentService.create(req));
    }

    @PutMapping("/{id}")
    public DepartmentResponse update(@PathVariable Long id, @Valid @RequestBody UpdateDepartmentRequest req) {
        return departmentService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        departmentService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
