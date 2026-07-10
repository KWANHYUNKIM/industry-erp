package com.erp.controller;

import com.erp.dto.OrderStageDtos.CreateOrderStageRequest;
import com.erp.dto.OrderStageDtos.OrderStageResponse;
import com.erp.dto.OrderStageDtos.UpdateOrderStageRequest;
import com.erp.service.OrderStageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/order-stages")
@RequiredArgsConstructor
public class OrderStageController {

    private final OrderStageService orderStageService;

    @GetMapping
    public List<OrderStageResponse> list() {
        return orderStageService.findAll();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<OrderStageResponse> create(@Valid @RequestBody CreateOrderStageRequest req) {
        return ResponseEntity.ok(orderStageService.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public OrderStageResponse update(@PathVariable Long id, @Valid @RequestBody UpdateOrderStageRequest req) {
        return orderStageService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        orderStageService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
