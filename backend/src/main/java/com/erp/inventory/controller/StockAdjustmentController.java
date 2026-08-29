package com.erp.inventory.controller;

import com.erp.inventory.dto.StockAdjustmentDtos.AdjustmentResponse;
import com.erp.inventory.dto.StockAdjustmentDtos.CreateAdjustmentRequest;
import com.erp.security.UserPrincipal;
import com.erp.inventory.service.StockAdjustmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.dto.StockAdjustmentDtos;

/** 기타이동 — 자가사용·불량처리·재고조정 (창고이동은 /api/stock-transfers) */
@RestController
@RequestMapping("/api/stock-adjustments")
@RequiredArgsConstructor
public class StockAdjustmentController {

    private final StockAdjustmentService stockAdjustmentService;

    /**
     * 기타이동 목록. 화면이 고른 기간만 준다.
     *
     * <p><code>all=true</code> 는 원본 <b>[오천건이상조회]</b> — 잘린 뒤 눌러서 전부 가져온다.
     */
    @GetMapping
    public StockAdjustmentDtos.AdjustmentListResponse list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "false") boolean all) {
        return stockAdjustmentService.list(from, to, all);
    }

    @PostMapping
    public ResponseEntity<AdjustmentResponse> create(
            @Valid @RequestBody CreateAdjustmentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockAdjustmentService.create(req, principal.getUsername()));
    }
}
