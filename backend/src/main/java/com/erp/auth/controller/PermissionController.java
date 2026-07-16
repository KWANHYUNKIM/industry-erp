package com.erp.auth.controller;

import com.erp.common.MenuPermissionCatalog;
import com.erp.auth.dto.PermissionDtos.PermissionResponse;
import com.erp.auth.repository.PermissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Comparator;
import java.util.List;
import com.erp.auth.domain.Permission;
import com.erp.auth.dto.PermissionDtos;

/**
 * 권한(메뉴) 카탈로그 조회. 역할 편집 화면이 카테고리별로 묶어 보여준다.
 */
@RestController
@RequestMapping("/api/permissions")
@RequiredArgsConstructor
public class PermissionController {

    private final PermissionRepository permissionRepository;

    @GetMapping
    public List<PermissionResponse> list() {
        return permissionRepository.findAll().stream()
                .sorted(Comparator.comparingInt(com.erp.auth.domain.Permission::getSort))
                .map(PermissionResponse::from)
                .toList();
    }
}
