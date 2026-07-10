package com.erp.controller;

import com.erp.dto.OrderTypeDtos.CreateOrderTypeRequest;
import com.erp.dto.OrderTypeDtos.OrderTypeResponse;
import com.erp.dto.OrderTypeDtos.UpdateOrderTypeRequest;
import com.erp.service.OrderTypeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/order-types")
@RequiredArgsConstructor
public class OrderTypeController {

    private final OrderTypeService orderTypeService;

    @GetMapping
    public List<OrderTypeResponse> list() {
        return orderTypeService.findAll();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<OrderTypeResponse> create(@Valid @RequestBody CreateOrderTypeRequest req) {
        return ResponseEntity.ok(orderTypeService.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public OrderTypeResponse update(@PathVariable Long id, @Valid @RequestBody UpdateOrderTypeRequest req) {
        return orderTypeService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        orderTypeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
