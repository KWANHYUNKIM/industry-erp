package com.erp.groupware.controller;

import com.erp.groupware.dto.ApprovalDtos.ApprovalActionRequest;
import com.erp.groupware.dto.ApprovalDtos.ApprovalResponse;
import com.erp.groupware.dto.ApprovalDtos.CreateApprovalRequest;
import com.erp.groupware.dto.ApprovalDtos.LinkVoucherRequest;
import com.erp.security.UserPrincipal;
import com.erp.groupware.service.ApprovalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.ApprovalDtos;

@RestController
@RequestMapping("/api/approvals")
@RequiredArgsConstructor
public class ApprovalController {

    private final ApprovalService approvalService;

    @GetMapping
    public List<ApprovalResponse> list(
            @RequestParam(required = false, defaultValue = "all") String scope,
            @RequestParam(required = false, defaultValue = "false") boolean includeDeleted,
            @AuthenticationPrincipal UserPrincipal principal) {
        return approvalService.list(scope, principal.getUsername(), includeDeleted);
    }

    @GetMapping("/{id}")
    public ApprovalResponse get(@PathVariable Long id) {
        return approvalService.get(id);
    }

    @PostMapping
    public ResponseEntity<ApprovalResponse> create(
            @Valid @RequestBody CreateApprovalRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(approvalService.create(req, principal.getUsername()));
    }

    /** 임시저장(기안중) 문서를 상신한다. */
    @PostMapping("/{id}/submit")
    public ApprovalResponse submit(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return approvalService.submit(id, principal.getUsername());
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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        approvalService.delete(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    /** ERP 전표 연결 (판매/구매/지출 중 하나) */
    @PostMapping("/{id}/vouchers")
    public ApprovalResponse linkVoucher(@PathVariable Long id, @RequestBody LinkVoucherRequest req) {
        return approvalService.linkVoucher(id, req);
    }

    @DeleteMapping("/{id}/vouchers/{voucherId}")
    public ApprovalResponse unlinkVoucher(@PathVariable Long id, @PathVariable Long voucherId) {
        return approvalService.unlinkVoucher(id, voucherId);
    }
}
