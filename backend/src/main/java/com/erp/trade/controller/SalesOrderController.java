package com.erp.trade.controller;

import com.erp.trade.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.trade.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.trade.dto.SalesOrderDtos.ShipRequest;
import com.erp.trade.dto.SalesOrderDtos.UnshippedLineResponse;
import com.erp.trade.dto.SalesOrderDtos.UpdateStatusRequest;
import com.erp.trade.dto.ShipmentDtos.ShipmentResponse;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.SalesOrderService;
import com.erp.trade.service.ShipmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.trade.dto.SalesOrderDtos;
import com.erp.trade.dto.ShipmentDtos;

@RestController
@RequestMapping("/api/sales-orders")
@RequiredArgsConstructor
public class SalesOrderController {

    private final SalesOrderService salesOrderService;
    private final ShipmentService shipmentService;

    @GetMapping
    public List<SalesOrderResponse> list() {
        return salesOrderService.findAll();
    }

    /** 미출하현황 (접수·진행중 주문의 라인별 미출하 잔량) */
    @GetMapping("/unshipped")
    public List<UnshippedLineResponse> unshipped() {
        return salesOrderService.findUnshipped();
    }

    @PostMapping
    public ResponseEntity<SalesOrderResponse> create(
            @Valid @RequestBody CreateSalesOrderRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(salesOrderService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}/status")
    public SalesOrderResponse updateStatus(@PathVariable Long id, @Valid @RequestBody UpdateStatusRequest req) {
        return salesOrderService.updateStatus(id, req.status());
    }

    /** 주문에서 출하지시 생성. body의 lines를 비우면 남은 잔량 전체를 출하한다. */
    @PostMapping("/{id}/ship")
    public ResponseEntity<ShipmentResponse> ship(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) ShipRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(shipmentService.createFromOrder(id, req, principal.getUsername()));
    }
}
