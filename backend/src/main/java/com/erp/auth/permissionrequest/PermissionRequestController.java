package com.erp.auth.permissionrequest;

import com.erp.auth.permissionrequest.dto.PermissionRequestDtos.ApproveRequest;
import com.erp.auth.permissionrequest.dto.PermissionRequestDtos.CreatePermissionRequest;
import com.erp.auth.permissionrequest.dto.PermissionRequestDtos.PermissionRequestResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 권한요청 · 권한승인대기현황(Self-Customizing › 사용자관리). */
@RestController
@RequestMapping("/api/permission-requests")
@RequiredArgsConstructor
public class PermissionRequestController {

    private final PermissionRequestService service;

    @PostMapping
    public PermissionRequestResponse create(@AuthenticationPrincipal UserPrincipal principal,
                                            @Valid @RequestBody CreatePermissionRequest req) {
        return service.create(req, principal.getId());
    }

    @GetMapping
    public List<PermissionRequestResponse> list(@AuthenticationPrincipal UserPrincipal principal,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                @RequestParam(required = false) String user,
                                                @RequestParam(required = false) PermissionRequestStatus status) {
        return service.list(from, to, user, status, principal.isAdmin());
    }

    @PostMapping("/{id}/approve")
    public PermissionRequestResponse approve(@AuthenticationPrincipal UserPrincipal principal, @PathVariable Long id,
                                             @Valid @RequestBody ApproveRequest req) {
        return service.approve(id, req.kind(), req.row(), principal.getId(), principal.isAdmin());
    }

    @PostMapping("/{id}/reject")
    public PermissionRequestResponse reject(@AuthenticationPrincipal UserPrincipal principal, @PathVariable Long id) {
        return service.reject(id, principal.getId(), principal.isAdmin());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal, @PathVariable Long id) {
        service.delete(id, principal.isAdmin());
        return ResponseEntity.noContent().build();
    }
}
