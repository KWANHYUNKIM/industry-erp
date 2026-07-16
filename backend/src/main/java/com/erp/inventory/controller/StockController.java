package com.erp.inventory.controller;

import com.erp.inventory.dto.StockDtos.StockResponse;
import com.erp.inventory.dto.StockDtos.StockTransactionRequest;
import com.erp.inventory.dto.StockDtos.StockTransactionResponse;
import com.erp.security.UserPrincipal;
import com.erp.inventory.service.StockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

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

    /** 입고/출고/조정 등록 */
    @PostMapping("/transactions")
    public ResponseEntity<StockTransactionResponse> record(
            @Valid @RequestBody StockTransactionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockService.record(req, principal.getUsername()));
    }
}
