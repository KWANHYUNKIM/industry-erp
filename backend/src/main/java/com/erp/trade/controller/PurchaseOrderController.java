package com.erp.trade.controller;

import com.erp.trade.dto.PurchaseDtos.PurchaseResponse;
import com.erp.trade.dto.PurchaseOrderDtos.ApplyPricesRequest;
import com.erp.trade.dto.PurchaseOrderDtos.CreatePurchaseOrderRequest;
import com.erp.trade.dto.PurchaseOrderDtos.PlanRequest;
import com.erp.trade.dto.PurchaseOrderDtos.PurchaseOrderResponse;
import com.erp.trade.dto.PurchaseOrderDtos.ReceiveRequest;
import com.erp.trade.domain.PurchaseOrderStatus;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.PurchaseOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.trade.dto.PurchaseDtos;
import com.erp.trade.dto.PurchaseOrderDtos;

@RestController
@RequestMapping("/api/purchase-orders")
@RequiredArgsConstructor
public class PurchaseOrderController {

    private final PurchaseOrderService service;

    /** 전체 발주서 목록. status 지정 시 해당 진행상태만(발주요청조회/현황 등에서 사용). */
    @GetMapping
    public List<PurchaseOrderResponse> list(@RequestParam(required = false) PurchaseOrderStatus status) {
        return status != null ? service.findByStatus(status) : service.findAll();
    }

    /** 발주 파이프라인 상태별 집계(건수·금액). 발주요청현황 상단 요약에 사용. */
    @GetMapping("/summary")
    public List<PurchaseOrderDtos.PurchaseOrderSummaryRow> summary() {
        return service.summary();
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
    public PurchaseOrderResponse plan(@PathVariable Long id, @RequestBody(required = false) PlanRequest req,
                                      @AuthenticationPrincipal UserPrincipal principal) {
        return service.plan(id, req, principal.getUsername());
    }

    /** 단가요청 회신 반영 */
    @PostMapping("/{id}/prices")
    public PurchaseOrderResponse applyPrices(@PathVariable Long id, @Valid @RequestBody ApplyPricesRequest req,
                                             @AuthenticationPrincipal UserPrincipal principal) {
        return service.applyPrices(id, req, principal.getUsername());
    }

    /**
     * 원본 단가요청진행단계의 [이력] — 그 발주가 밟아 온 자취.
     *
     * <p>목록에 끼워 넣지 않고 <b>펼칠 때</b> 이 자리로 가져간다. 줄마다 이력을 달면
     * 보지도 않을 자취까지 전부 실어 나른다.
     */
    @GetMapping("/{id}/history")
    public java.util.List<com.erp.trade.dto.PurchaseOrderDtos.HistoryRow> history(@PathVariable Long id) {
        return service.history(id);
    }

    /** 발주 확정(발주서 발행) */
    @PostMapping("/{id}/confirm")
    public PurchaseOrderResponse confirm(@PathVariable Long id,
                                         @AuthenticationPrincipal UserPrincipal principal) {
        return service.confirm(id, principal.getUsername());
    }

    @PostMapping("/{id}/cancel")
    public PurchaseOrderResponse cancel(@PathVariable Long id,
                                        @AuthenticationPrincipal UserPrincipal principal) {
        return service.cancel(id, principal.getUsername());
    }

    /** 입고 전환 → 생성된 구매전표(Purchase)를 반환 */
    @PostMapping("/{id}/receive")
    public ResponseEntity<PurchaseResponse> receive(
            @PathVariable Long id,
            @Valid @RequestBody ReceiveRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.receive(id, req, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
