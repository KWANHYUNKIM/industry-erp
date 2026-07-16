package com.erp.auth.controller;

import com.erp.auth.dto.RoleDtos.CreateRoleRequest;
import com.erp.auth.dto.RoleDtos.RoleResponse;
import com.erp.auth.dto.RoleDtos.UpdateRoleRequest;
import com.erp.auth.service.RoleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.auth.dto.RoleDtos;

/**
 * 역할과 역할별 메뉴 권한. 조회는 로그인 사용자 누구나(사용자 등록 폼 등에서 사용),
 * 생성·수정·삭제는 인가 인터셉터가 USER_MANAGE(ADMIN) 로 막는다.
 */
@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roleService;

    @GetMapping
    public List<RoleResponse> list() {
        return roleService.list();
    }

    @PostMapping
    public RoleResponse create(@Valid @RequestBody CreateRoleRequest req) {
        return roleService.create(req);
    }

    @PutMapping("/{id}")
    public RoleResponse update(@PathVariable Long id, @Valid @RequestBody UpdateRoleRequest req) {
        return roleService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        roleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
