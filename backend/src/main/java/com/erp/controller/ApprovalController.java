package com.erp.controller;

import com.erp.dto.ApprovalDtos.ApprovalActionRequest;
import com.erp.dto.ApprovalDtos.ApprovalResponse;
import com.erp.dto.ApprovalDtos.CreateApprovalRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.ApprovalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/approvals")
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalService approvalService;

    @GetMapping
    public List<ApprovalResponse> list(
            @RequestParam(required = false, defaultValue = "all") String scope,
            @AuthenticationPrincipal UserPrincipal principal) {
        return approvalService.list(scope, principal.getUsername());
    }

    @PostMapping
    public ResponseEntity<ApprovalResponse> create(
            @Valid @RequestBody CreateApprovalRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(approvalService.create(req, principal.getUsername()));
    }

    @PostMapping("/{id}/approve")
    public ApprovalResponse approve(
            @PathVariable Long id,
            @RequestBody(required = false) ApprovalActionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return approvalService.approve(id, req, principal.getUsername());
    }

    @PostMapping("/{id}/reject")
    public ApprovalResponse reject(
            @PathVariable Long id,
            @RequestBody(required = false) ApprovalActionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return approvalService.reject(id, req, principal.getUsername());
    }
}
