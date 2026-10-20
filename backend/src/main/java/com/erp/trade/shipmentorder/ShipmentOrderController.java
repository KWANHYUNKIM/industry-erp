package com.erp.trade.shipmentorder;

import com.erp.security.UserPrincipal;
import com.erp.trade.shipment.dto.ShipmentDtos.ShipmentResponse;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.SaveRequest;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.ShipRequest;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.ShipmentOrderResponse;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.StatusRequest;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.UnshippedLine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 출하지시서(원본 E040220 · E040221 · E040222) · 미출하현황(E040228). */
@RestController
@RequestMapping("/api/shipment-orders")
@RequiredArgsConstructor
public class ShipmentOrderController {

    private final ShipmentOrderService service;

    @GetMapping
    public List<ShipmentOrderResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findAll(from, to);
    }

    @GetMapping("/unshipped")
    public List<UnshippedLine> unshipped() {
        return service.findUnshipped();
    }

    @GetMapping("/{id}")
    public ShipmentOrderResponse get(@PathVariable Long id) {
        return service.find(id);
    }

    @PostMapping
    public ShipmentOrderResponse create(@Valid @RequestBody SaveRequest req,
                                        @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    @PutMapping("/{id}")
    public ShipmentOrderResponse update(@PathVariable Long id, @Valid @RequestBody SaveRequest req) {
        return service.update(id, req);
    }

    @PatchMapping("/{id}/status")
    public ShipmentOrderResponse status(@PathVariable Long id, @Valid @RequestBody StatusRequest req) {
        return service.updateStatus(id, req.status());
    }

    @PostMapping("/{id}/ship")
    public ShipmentResponse ship(@PathVariable Long id, @Valid @RequestBody(required = false) ShipRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.ship(id, req, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
