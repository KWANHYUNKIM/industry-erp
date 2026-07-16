package com.erp.inventory.controller;

import com.erp.inventory.dto.StockAdjustmentDtos.AdjustmentResponse;
import com.erp.inventory.dto.StockAdjustmentDtos.CreateAdjustmentRequest;
import com.erp.security.UserPrincipal;
import com.erp.inventory.service.StockAdjustmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.dto.StockAdjustmentDtos;

/** 기타이동 — 자가사용·불량처리·재고조정 (창고이동은 /api/stock-transfers) */
@RestController
@RequestMapping("/api/stock-adjustments")
@RequiredArgsConstructor
public class StockAdjustmentController {

    private final StockAdjustmentService stockAdjustmentService;

    @GetMapping
    public List<AdjustmentResponse> list() {
        return stockAdjustmentService.findAll();
    }

    @PostMapping
    public ResponseEntity<AdjustmentResponse> create(
            @Valid @RequestBody CreateAdjustmentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockAdjustmentService.create(req, principal.getUsername()));
    }
}
