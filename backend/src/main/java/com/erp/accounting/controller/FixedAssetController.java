package com.erp.accounting.controller;

import com.erp.accounting.dto.FixedAssetDtos.AssetResponse;
import com.erp.accounting.dto.FixedAssetDtos.CreateAssetRequest;
import com.erp.accounting.dto.FixedAssetDtos.DepreciateRequest;
import com.erp.accounting.dto.FixedAssetDtos.DepreciationResponse;
import com.erp.accounting.dto.FixedAssetDtos.DepreciationRunResponse;
import com.erp.accounting.dto.FixedAssetDtos.DisposeRequest;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.FixedAssetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.FixedAssetDtos;

/** 회계 I > 고정자산 — 취득 등록 · 월별 감가상각 · 처분 */
@RestController
@RequestMapping("/api/fixed-assets")
@RequiredArgsConstructor
public class FixedAssetController {

    private final FixedAssetService service;

    @GetMapping
    public List<AssetResponse> list(
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findAll(from, to);
    }

    @PostMapping
    public AssetResponse create(@Valid @RequestBody CreateAssetRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    /** 귀속월(yyyy-MM)의 감가상각을 사용중 자산 전체에 대해 실행 */
    @PostMapping("/depreciate")
    public DepreciationRunResponse depreciate(@Valid @RequestBody DepreciateRequest req,
                                              @AuthenticationPrincipal UserPrincipal principal) {
        return service.depreciate(req.period(), principal.getUsername());
    }

    @GetMapping("/depreciations")
    public List<DepreciationResponse> depreciations(@RequestParam(required = false) String period,
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findDepreciations(period, from, to);
    }

    @PostMapping("/{id}/dispose")
    public AssetResponse dispose(@PathVariable Long id, @Valid @RequestBody DisposeRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.dispose(id, req, principal.getUsername());
    }
}
