package com.erp.controller;

import com.erp.dto.RoleDtos.RoleResponse;
import com.erp.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 역할 목록 조회 (로그인 사용자 누구나 조회 가능 — 사용자 등록 폼 등에서 사용).
 */
@RestController
@RequestMapping("/api/roles")
@RequiredArgsConstructor
public class RoleController {

    private final RoleRepository roleRepository;

    @GetMapping
    public List<RoleResponse> list() {
        return roleRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(RoleResponse::from)
                .toList();
    }
}
