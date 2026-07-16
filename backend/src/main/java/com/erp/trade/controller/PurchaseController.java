package com.erp.trade.controller;

import com.erp.trade.dto.PurchaseDtos.CreatePurchaseRequest;
import com.erp.trade.dto.PurchaseDtos.PurchaseDiscountRow;
import com.erp.trade.dto.PurchaseDtos.PurchaseResponse;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.PurchaseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.PurchaseDtos;

@RestController
@RequestMapping("/api/purchases")
@RequiredArgsConstructor
public class PurchaseController {

    private final PurchaseService purchaseService;

    @GetMapping
    public List<PurchaseResponse> list() {
        return purchaseService.findAll();
    }

    /** 구매/외주 할인현황: 라인별 기준단가 대비 실매입 할인 내역 */
    @GetMapping("/discounts")
    public List<PurchaseDiscountRow> discounts(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return purchaseService.findDiscounts(from, to);
    }

    @PostMapping
    public ResponseEntity<PurchaseResponse> create(
            @Valid @RequestBody CreatePurchaseRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(purchaseService.create(req, principal.getUsername()));
    }
}
