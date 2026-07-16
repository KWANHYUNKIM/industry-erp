package com.erp.trade.controller;

import com.erp.trade.dto.SalesDtos.CreateSalesRequest;
import com.erp.trade.dto.SalesDtos.SalesDiscountRow;
import com.erp.trade.dto.SalesDtos.SalesResponse;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.SalesService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.SalesDtos;

@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SalesController {

    private final SalesService salesService;

    @GetMapping
    public List<SalesResponse> list() {
        return salesService.findAll();
    }

    /** 판매할인현황: 라인별 기준단가 대비 실판매 할인 내역 */
    @GetMapping("/discounts")
    public List<SalesDiscountRow> discounts(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return salesService.findDiscounts(from, to);
    }

    @PostMapping
    public ResponseEntity<SalesResponse> create(
            @Valid @RequestBody CreateSalesRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(salesService.create(req, principal.getUsername()));
    }

    /** 판매조회의 '확인' */
    @PostMapping("/{id}/confirm")
    public SalesResponse confirm(@PathVariable Long id) {
        return salesService.confirm(id);
    }

    /** 판매조회의 '확인취소' */
    @PostMapping("/{id}/unconfirm")
    public SalesResponse unconfirm(@PathVariable Long id) {
        return salesService.unconfirm(id);
    }
}
