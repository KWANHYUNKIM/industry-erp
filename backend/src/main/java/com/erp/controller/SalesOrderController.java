package com.erp.controller;

import com.erp.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.dto.SalesOrderDtos.UnshippedLineResponse;
import com.erp.dto.SalesOrderDtos.UpdateStatusRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.SalesOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/sales-orders")
@RequiredArgsConstructor
public class SalesOrderController {

    private final SalesOrderService salesOrderService;

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
}
