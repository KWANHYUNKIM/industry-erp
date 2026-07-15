package com.erp.controller;

import com.erp.dto.CommonCodeDtos.CodeGroupResponse;
import com.erp.dto.CommonCodeDtos.CodeResponse;
import com.erp.dto.CommonCodeDtos.CreateCodeRequest;
import com.erp.dto.CommonCodeDtos.CreateGroupRequest;
import com.erp.dto.CommonCodeDtos.UpdateCodeRequest;
import com.erp.service.CommonCodeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 공통코드 (Self-Customizing > 기타관리 > 공통코드) — 카드사·결제대행사·추가항목유형 등 */
@RestController
@RequestMapping("/api/codes")
@RequiredArgsConstructor
public class CommonCodeController {

    private final CommonCodeService service;

    @GetMapping
    public List<CodeGroupResponse> list() {
        return service.findAll();
    }

    /** 화면이 그룹코드로 목록을 가져간다 (예: /api/codes/CARD_COMPANY) */
    @GetMapping("/{groupCode}")
    public List<CodeResponse> byGroup(@PathVariable String groupCode) {
        return service.findByGroupCode(groupCode);
    }

    @PostMapping("/groups")
    public ResponseEntity<CodeGroupResponse> createGroup(@Valid @RequestBody CreateGroupRequest req) {
        return ResponseEntity.ok(service.createGroup(req));
    }

    @DeleteMapping("/groups/{id}")
    public ResponseEntity<Void> deleteGroup(@PathVariable Long id) {
        service.deleteGroup(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/groups/{groupId}/codes")
    public ResponseEntity<CodeResponse> addCode(@PathVariable Long groupId,
                                                @Valid @RequestBody CreateCodeRequest req) {
        return ResponseEntity.ok(service.addCode(groupId, req));
    }

    @PutMapping("/codes/{id}")
    public CodeResponse updateCode(@PathVariable Long id, @Valid @RequestBody UpdateCodeRequest req) {
        return service.updateCode(id, req);
    }

    @DeleteMapping("/codes/{id}")
    public ResponseEntity<Void> deleteCode(@PathVariable Long id) {
        service.deleteCode(id);
        return ResponseEntity.noContent().build();
    }
}
