package com.erp.controller;

import com.erp.dto.PurchaseDtos.PurchaseResponse;
import com.erp.dto.PurchaseOrderDtos.ApplyPricesRequest;
import com.erp.dto.PurchaseOrderDtos.CreatePurchaseOrderRequest;
import com.erp.dto.PurchaseOrderDtos.PlanRequest;
import com.erp.dto.PurchaseOrderDtos.PurchaseOrderResponse;
import com.erp.dto.PurchaseOrderDtos.ReceiveRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.PurchaseOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/purchase-orders")
@RequiredArgsConstructor
public class PurchaseOrderController {

    private final PurchaseOrderService service;

    @GetMapping
    public List<PurchaseOrderResponse> list() {
        return service.findAll();
    }

    /** 발주요청 등록 */
    @PostMapping
    public ResponseEntity<PurchaseOrderResponse> create(
            @Valid @RequestBody CreatePurchaseOrderRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 발주계획 확정 (납기일 지정) */
    @PostMapping("/{id}/plan")
    public PurchaseOrderResponse plan(@PathVariable Long id, @RequestBody(required = false) PlanRequest req) {
        return service.plan(id, req);
    }

    /** 단가요청 회신 반영 */
    @PostMapping("/{id}/prices")
    public PurchaseOrderResponse applyPrices(@PathVariable Long id, @Valid @RequestBody ApplyPricesRequest req) {
        return service.applyPrices(id, req);
    }

    /** 발주 확정(발주서 발행) */
    @PostMapping("/{id}/confirm")
    public PurchaseOrderResponse confirm(@PathVariable Long id) {
        return service.confirm(id);
    }

    @PostMapping("/{id}/cancel")
    public PurchaseOrderResponse cancel(@PathVariable Long id) {
        return service.cancel(id);
    }

    /** 입고 전환 → 생성된 구매전표(Purchase)를 반환 */
    @PostMapping("/{id}/receive")
    public ResponseEntity<PurchaseResponse> receive(
            @PathVariable Long id,
            @Valid @RequestBody ReceiveRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.receive(id, req, principal.getUsername()));
    }
}
