package com.erp.inventory.adjustment;

import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.BulkAdjustRequest;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.BulkAdjustResult;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.CreateStagedRequest;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.StagedResponse;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.SlipRequest;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.SlipResponse;
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

    /** 단계별재고실사(E040650) 실사 전표 — 등록 · 열기 · 수정 · 삭제. */
    @PostMapping("/slips")
    public SlipResponse createSlip(@Valid @RequestBody SlipRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.createSlip(req, principal.getUsername());
    }

    @GetMapping("/slips/{slipNo}")
    public SlipResponse getSlip(@PathVariable String slipNo) {
        return service.getSlip(slipNo);
    }

    @PutMapping("/slips/{slipNo}")
    public SlipResponse updateSlip(@PathVariable String slipNo, @Valid @RequestBody SlipRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateSlip(slipNo, req, principal.getUsername());
    }

    @DeleteMapping("/slips/{slipNo}")
    public ResponseEntity<Void> deleteSlip(@PathVariable String slipNo, @AuthenticationPrincipal UserPrincipal principal) {
        service.deleteSlip(slipNo, principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    /** 진행단계 줄의 [조정] → '조정' — 그 실사 전표만 재고조정전표로 맞춘다. */
    @PostMapping("/slips/{slipNo}/adjust")
    public BulkAdjustResult adjustSlip(@PathVariable String slipNo, @AuthenticationPrincipal UserPrincipal principal) {
        return service.adjustSlip(slipNo, principal.getUsername());
    }

    @PostMapping("/adjust")
    public BulkAdjustResult adjustAll(@Valid @RequestBody BulkAdjustRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.adjustAll(req, principal.getUsername());
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
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        service.delete(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
