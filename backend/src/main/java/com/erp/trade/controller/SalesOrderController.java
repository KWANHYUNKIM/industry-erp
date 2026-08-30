package com.erp.trade.controller;

import com.erp.trade.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.trade.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.trade.dto.SalesOrderDtos.ShipRequest;
import com.erp.trade.dto.SalesOrderDtos.UnshippedLineResponse;
import com.erp.trade.dto.SalesOrderDtos.UnsoldLineResponse;
import com.erp.trade.dto.SalesOrderDtos.UpdateStatusRequest;
import com.erp.trade.dto.ShipmentDtos.ShipmentResponse;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.SalesOrderService;
import com.erp.trade.service.ShipmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.SalesOrderDtos;
import com.erp.trade.dto.ShipmentDtos;

@RestController
@RequestMapping("/api/sales-orders")
@RequiredArgsConstructor
public class SalesOrderController {

    private final SalesOrderService salesOrderService;
    private final ShipmentService shipmentService;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @GetMapping
    public List<SalesOrderResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return salesOrderService.findAll(from, to);
    }

    /** 미출하현황 (접수·진행중 주문의 라인별 미출하 잔량) */
    @GetMapping("/unshipped")
    public List<UnshippedLineResponse> unshipped(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return salesOrderService.findUnshipped(from, to);
    }

    /** 미판매현황 — 판매 전표로 아직 안 끊은 주문 잔량. */
    @GetMapping("/unsold")
    public List<UnsoldLineResponse> unsold(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return salesOrderService.findUnsold(from, to);
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

    /**
     * 오더관리 유형·진행단계를 지정한다. (오더관리진행단계 화면)
     *
     * <p>{@code stageId} 를 비우면 <b>다음 단계</b>로 한 칸 나아간다 — 원본 화면의
     * 단계 이동에 해당한다. {@code complete=true} 면 마지막 단계로 보낸다([전체단계완료]).
     */
    @PatchMapping("/{id}/stage")
    public SalesOrderResponse updateStage(
            @PathVariable Long id,
            @RequestParam(required = false) Long orderTypeId,
            @RequestParam(required = false) Long stageId,
            @RequestParam(defaultValue = "false") boolean complete) {
        return salesOrderService.updateStage(id, orderTypeId, stageId, complete);
    }

    /** 주문에서 출하지시 생성. body의 lines를 비우면 남은 잔량 전체를 출하한다. */
    @PostMapping("/{id}/ship")
    public ResponseEntity<ShipmentResponse> ship(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) ShipRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(shipmentService.createFromOrder(id, req, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        salesOrderService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
