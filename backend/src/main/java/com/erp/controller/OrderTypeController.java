package com.erp.controller;

import com.erp.dto.OrderTypeDtos.CreateOrderTypeRequest;
import com.erp.dto.OrderTypeDtos.OrderTypeResponse;
import com.erp.dto.OrderTypeDtos.UpdateOrderTypeRequest;
import com.erp.service.OrderTypeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<OrderTypeResponse> create(@Valid @RequestBody CreateOrderTypeRequest req) {
        return ResponseEntity.ok(orderTypeService.create(req));
    }

    @PutMapping("/{id}")
    public OrderTypeResponse update(@PathVariable Long id, @Valid @RequestBody UpdateOrderTypeRequest req) {
        return orderTypeService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        orderTypeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
