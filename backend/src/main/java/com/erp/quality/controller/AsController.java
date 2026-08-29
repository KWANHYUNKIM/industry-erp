package com.erp.quality.controller;

import com.erp.quality.dto.AsDtos.AsConsumptionRow;
import com.erp.quality.dto.AsDtos.AsPartResponse;
import com.erp.quality.dto.AsDtos.AsResponse;
import com.erp.quality.dto.AsDtos.CreateAsPartRequest;
import com.erp.quality.dto.AsDtos.CreateAsRequest;
import com.erp.quality.dto.AsDtos.UpdateAsRequest;
import com.erp.security.UserPrincipal;
import com.erp.quality.service.AsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.quality.dto.AsDtos;

@RestController
@RequestMapping("/api/as-requests")
@RequiredArgsConstructor
public class AsController {

    private final AsService asService;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @GetMapping
    public List<AsResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return asService.findAll(from, to);
    }

    @PostMapping
    public ResponseEntity<AsResponse> create(
            @Valid @RequestBody CreateAsRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(asService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public AsResponse update(@PathVariable Long id, @RequestBody UpdateAsRequest req) {
        return asService.update(id, req);
    }

    // 소모부품 -------------------------------------------------------------

    /** A/S소모현황 — 품목별 소모 집계. 원본 조건 접수일자·창고·거래처·수리품목으로 거른다. */
    @GetMapping("/parts/consumption")
    public List<AsConsumptionRow> consumption(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Long partnerId,
            @RequestParam(required = false) Long repairItemId,
            @RequestParam(required = false) Long projectId) {
        return asService.consumption(from, to, warehouseId, partnerId, repairItemId, projectId);
    }

    @GetMapping("/{id}/parts")
    public List<AsPartResponse> parts(@PathVariable Long id) {
        return asService.findParts(id);
    }

    @PostMapping("/{id}/parts")
    public ResponseEntity<AsPartResponse> addPart(
            @PathVariable Long id,
            @Valid @RequestBody CreateAsPartRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(asService.addPart(id, req, principal.getUsername()));
    }

    @DeleteMapping("/parts/{partId}")
    public ResponseEntity<Void> deletePart(@PathVariable Long partId,
                                           @AuthenticationPrincipal UserPrincipal principal) {
        asService.deletePart(partId, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
