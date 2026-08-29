package com.erp.trade.controller;

import com.erp.trade.dto.ShipmentDtos.CreateShipmentRequest;
import com.erp.trade.dto.ShipmentDtos.ShipmentResponse;
import com.erp.trade.dto.ShipmentDtos.UpdateStatusRequest;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.ShipmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.ShipmentDtos;

@RestController
@RequestMapping("/api/shipments")
@RequiredArgsConstructor
public class ShipmentController {

    private final ShipmentService shipmentService;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @GetMapping
    public List<ShipmentResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return shipmentService.findAll(from, to);
    }

    /** 미출하현황 (출하지시 상태의 출하) */
    @GetMapping("/unshipped")
    public List<ShipmentResponse> unshipped() {
        return shipmentService.findUnshipped();
    }

    @PostMapping
    public ResponseEntity<ShipmentResponse> create(
            @Valid @RequestBody CreateShipmentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(shipmentService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}/status")
    public ShipmentResponse updateStatus(@PathVariable Long id, @Valid @RequestBody UpdateStatusRequest req) {
        return shipmentService.updateStatus(id, req.status());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        shipmentService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
