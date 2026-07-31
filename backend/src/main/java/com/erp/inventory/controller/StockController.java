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

    /** 잔량재집계 — 점검만(값을 고치지 않는다). 월은 yyyy-MM. */
    @GetMapping("/recalc")
    public StockDtos.StockRecalcResult recalcPreview(
            @RequestParam(required = false) String fromMonth,
            @RequestParam(required = false) String toMonth) {
        return stockService.recalculate(startOf(fromMonth), endOf(toMonth), false);
    }

    /** 잔량재집계 실행 — 어긋난 거래잔량·현재고를 수불 이력 기준으로 맞춘다. */
    @PostMapping("/recalc")
    public StockDtos.StockRecalcResult recalcApply(
            @RequestParam(required = false) String fromMonth,
            @RequestParam(required = false) String toMonth) {
        return stockService.recalculate(startOf(fromMonth), endOf(toMonth), true);
    }

    /** yyyy-MM → 그 달 1일. 생략 시 아주 과거(전 기간). */
    private LocalDate startOf(String month) {
        return month == null || month.isBlank()
                ? LocalDate.of(1900, 1, 1)
                : java.time.YearMonth.parse(month).atDay(1);
    }

    /** yyyy-MM → 그 달 말일. 생략 시 아주 미래(전 기간). */
    private LocalDate endOf(String month) {
        return month == null || month.isBlank()
                ? LocalDate.of(2999, 12, 31)
                : java.time.YearMonth.parse(month).atEndOfMonth();
    }

    /** 입고/출고/조정 등록 */
    @PostMapping("/transactions")
    public ResponseEntity<StockTransactionResponse> record(
            @Valid @RequestBody StockTransactionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockService.record(req, principal.getUsername()));
    }
}
