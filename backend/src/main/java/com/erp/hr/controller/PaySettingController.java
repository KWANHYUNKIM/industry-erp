package com.erp.hr.controller;

import com.erp.hr.dto.PaySettingDtos.PayGroupRequest;
import com.erp.hr.dto.PaySettingDtos.PayGroupResponse;
import com.erp.hr.dto.PaySettingDtos.PayItemRequest;
import com.erp.hr.dto.PaySettingDtos.PayItemResponse;
import com.erp.hr.dto.PaySettingDtos.TransferRequest;
import com.erp.hr.dto.PaySettingDtos.TransferResponse;
import com.erp.security.UserPrincipal;
import com.erp.hr.service.PaySettingService;
import com.erp.hr.service.PayrollTransferService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.hr.dto.PaySettingDtos;

/** 관리 > 급여 설정(수당·공제 항목/그룹)과 급여이체 */
@RestController
@RequestMapping("/api/pay-settings")
@RequiredArgsConstructor
public class PaySettingController {

    private final PaySettingService service;
    private final PayrollTransferService transferService;

    @GetMapping("/items")
    public List<PayItemResponse> items() {
        return service.findItems();
    }

    @PostMapping("/items")
    public PayItemResponse createItem(@Valid @RequestBody PayItemRequest req) {
        return service.createItem(req);
    }

    @PutMapping("/items/{id}")
    public PayItemResponse updateItem(@PathVariable Long id, @Valid @RequestBody PayItemRequest req) {
        return service.updateItem(id, req);
    }

    @GetMapping("/groups")
    public List<PayGroupResponse> groups() {
        return service.findGroups();
    }

    @PostMapping("/groups")
    public PayGroupResponse createGroup(@Valid @RequestBody PayGroupRequest req) {
        return service.createGroup(req);
    }

    @PutMapping("/groups/{id}")
    public PayGroupResponse updateGroup(@PathVariable Long id, @Valid @RequestBody PayGroupRequest req) {
        return service.updateGroup(id, req);
    }

    @DeleteMapping("/groups/{id}")
    public ResponseEntity<Void> deleteGroup(@PathVariable Long id) {
        service.deleteGroup(id);
        return ResponseEntity.noContent().build();
    }

    // ── 급여이체 ──────────────────────────────────────────────────────

    @GetMapping("/transfers")
    public List<TransferResponse> transfers() {
        return transferService.findAll();
    }

    /** 이미 이체된 급여명세 id — 이체 화면이 대상 목록에서 제외한다 */
    @GetMapping("/transfers/transferred-payslips")
    public List<Long> transferredPayslips() {
        return transferService.transferredPayslipIds();
    }

    @PostMapping("/transfers")
    public TransferResponse createTransfer(@Valid @RequestBody TransferRequest req,
                                           @AuthenticationPrincipal UserPrincipal principal) {
        return transferService.create(req, principal.getUsername());
    }
}
