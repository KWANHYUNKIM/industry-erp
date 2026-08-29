package com.erp.inventory.controller;

import com.erp.inventory.domain.enums.StagedStatus;
import com.erp.inventory.dto.StagedAdjustmentDtos.CreateStagedRequest;
import com.erp.inventory.dto.StagedAdjustmentDtos.StagedResponse;
import com.erp.inventory.service.StagedStockAdjustmentService;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/staged-adjustments")
@RequiredArgsConstructor
public class StagedStockAdjustmentController {

    private final StagedStockAdjustmentService service;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @GetMapping
    public List<StagedResponse> list(
            @RequestParam(required = false) StagedStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findAll(status, from, to);
    }

    @PostMapping
    public ResponseEntity<StagedResponse> create(
            @Valid @RequestBody CreateStagedRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @PostMapping("/{id}/apply")
    public StagedResponse apply(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.apply(id, principal.getUsername());
    }

    @PostMapping("/{id}/reject")
    public StagedResponse reject(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.reject(id, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
