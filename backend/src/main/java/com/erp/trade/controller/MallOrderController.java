package com.erp.trade.controller;

import com.erp.trade.dto.MallOrderDtos.CollectOrderRequest;
import com.erp.trade.dto.MallOrderDtos.ConvertRequest;
import com.erp.trade.dto.MallOrderDtos.MallOrderResponse;
import com.erp.trade.dto.MallOrderDtos.MallOverview;
import com.erp.trade.dto.MallOrderDtos.MapItemRequest;
import com.erp.trade.dto.SalesDtos.SalesResponse;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.MallOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.erp.trade.dto.MallOrderDtos;
import com.erp.trade.dto.SalesDtos;

/** 쇼핑몰관리 (재고 I > 쇼핑몰관리) — 외부몰 주문 수집 → 확인 → 판매전환 */
@RestController
@RequestMapping("/api/mall-orders")
@RequiredArgsConstructor
public class MallOrderController {

    private final MallOrderService service;

    @GetMapping
    public MallOverview overview() {
        return service.overview();
    }

    /** 주문 수집 (몰 API 연동이 붙기 전까지 이 진입점이 그 자리다) */
    @PostMapping
    public ResponseEntity<MallOrderResponse> collect(@Valid @RequestBody CollectOrderRequest req,
                                                     @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.collect(req, principal.getUsername()));
    }

    /** 몰 상품 ↔ 우리 품목 매핑 */
    @PutMapping("/{id}/item")
    public MallOrderResponse mapItem(@PathVariable Long id, @Valid @RequestBody MapItemRequest req) {
        return service.mapItem(id, req);
    }

    @PostMapping("/{id}/confirm")
    public MallOrderResponse confirm(@PathVariable Long id) {
        return service.confirm(id);
    }

    @PostMapping("/{id}/cancel")
    public MallOrderResponse cancel(@PathVariable Long id) {
        return service.cancel(id);
    }

    /** 판매전환 → 생성된 판매전표를 반환 */
    @PostMapping("/{id}/convert")
    public SalesResponse convert(@PathVariable Long id,
                                 @Valid @RequestBody ConvertRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.convert(id, req, principal.getUsername());
    }
}
