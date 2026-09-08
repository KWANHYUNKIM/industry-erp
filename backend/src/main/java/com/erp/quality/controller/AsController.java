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
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            /* 원본 A/S수리현황(E040611)의 주 조건 [기준일자] — 수리한 날이다. */
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate doneFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate doneTo) {
        return asService.findAll(from, to, doneFrom, doneTo);
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

    /**
     * A/S소모현황 — 품목별 소모 집계.
     *
     * <p>서버가 <b>품목별로 합쳐서</b> 주므로, 합친 뒤에는 화면에서 더 거를 수 없다.
     * 그래서 원본 조건을 전부 여기서 받는다(2026-09-09 E040641 실측으로 일곱이 늘었다):
     * 거래처그룹1 · 수리품목의 품목구분·품목그룹1 · 수리진행상태 · 제목 · 적요 · 최초작성자.
     */
    @GetMapping("/parts/consumption")
    public List<AsConsumptionRow> consumption(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Long partnerId,
            @RequestParam(required = false) Long repairItemId,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) String partnerGroup,
            @RequestParam(required = false) String itemCategory,
            @RequestParam(required = false) String itemGroup,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String remark,
            @RequestParam(required = false) String createdBy) {
        return asService.consumption(from, to, warehouseId, partnerId, repairItemId, projectId,
                partnerGroup, itemCategory, itemGroup, status, title, remark, createdBy);
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
