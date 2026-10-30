package com.erp.auth.workpermission;

import com.erp.auth.workpermission.dto.WorkPermissionDtos.CopyRequest;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.GroupWorksResponse;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.MasterResponse;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.SaveBaseRequest;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.SaveMastersRequest;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.SaveWorksRequest;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.UserWorksResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 업무권한 설정 — 마스터 전용(카탈로그 USER_MANAGE = MASTER_ONLY, 조회도 막힌다).
 * 사용자등록 [권한] 탭 · 개별권한설정 창 · 권한그룹 설정의 업무권한 · 권한복사 · 관리자설정.
 */
@RestController
@RequestMapping("/api/work-permissions")
@RequiredArgsConstructor
public class WorkPermissionController {

    private final WorkPermissionService service;

    @GetMapping("/users/{id}")
    public UserWorksResponse userWorks(@PathVariable Long id) {
        return service.userWorks(id);
    }

    @PutMapping("/users/{id}/works")
    public UserWorksResponse saveUserWorks(@PathVariable Long id, @Valid @RequestBody SaveWorksRequest req) {
        return service.saveUserWorks(id, req.rows());
    }

    @PutMapping("/users/{id}/base")
    public UserWorksResponse saveBase(@PathVariable Long id, @Valid @RequestBody SaveBaseRequest req) {
        return service.saveBase(id, req.basePermission(), req.groupId());
    }

    @PostMapping("/copy")
    public ResponseEntity<Void> copy(@Valid @RequestBody CopyRequest req) {
        service.copy(req.sourceUserId(), req.targetUserIds());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/groups/{id}")
    public GroupWorksResponse groupWorks(@PathVariable Long id) {
        return service.groupWorks(id);
    }

    @PutMapping("/groups/{id}/works")
    public GroupWorksResponse saveGroupWorks(@PathVariable Long id, @Valid @RequestBody SaveWorksRequest req) {
        return service.saveGroupWorks(id, req.rows());
    }

    @GetMapping("/masters")
    public List<MasterResponse> masters() {
        return service.masters();
    }

    @PutMapping("/masters")
    public List<MasterResponse> saveMasters(@AuthenticationPrincipal UserPrincipal principal,
                                            @Valid @RequestBody SaveMastersRequest req) {
        return service.saveMasters(req.userIds(), principal.getId());
    }
}
