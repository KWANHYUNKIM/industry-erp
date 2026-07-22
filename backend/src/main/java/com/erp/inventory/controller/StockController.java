package com.erp.inventory.controller;

import com.erp.inventory.dto.StockDtos.StockResponse;
import com.erp.inventory.dto.StockDtos.StockTransactionRequest;
import com.erp.inventory.dto.StockDtos.StockTransactionResponse;
import com.erp.security.UserPrincipal;
import com.erp.inventory.service.StockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.dto.StockDtos;

@RestController
@RequestMapping("/api/stock")
@RequiredArgsConstructor
public class StockController {

    private final StockService stockService;

    /** 현재고 목록 */
    @GetMapping
    public List<StockResponse> current() {
        return stockService.currentStock();
    }

    /** 입출고 이력 */
    @GetMapping("/transactions")
    public Page<StockTransactionResponse> transactions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return stockService.transactions(page, size);
    }

    /** 재고수불부 — 기간·창고·품목으로 거른 입출고 원장(일자순) + 기초재고. 파라미터 생략 시 미필터. */
    @GetMapping("/ledger")
    public StockDtos.StockLedgerResponse ledger(
            @RequestParam(required = false) Long itemId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return stockService.ledger(itemId, warehouseId, from, to);
    }

    /** 재고변동표 — 품목별 기초·입고·출고·기말. warehouseId 생략 시 전 창고 합산. */
    @GetMapping("/movement")
    public List<StockDtos.StockMovementRow> movement(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long warehouseId) {
        return stockService.movement(from, to, warehouseId);
    }

    /** 입고/출고/조정 등록 */
    @PostMapping("/transactions")
    public ResponseEntity<StockTransactionResponse> record(
            @Valid @RequestBody StockTransactionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockService.record(req, principal.getUsername()));
    }
}
