package com.erp.trade.ordertype;

import com.erp.trade.ordertype.dto.OrderTypeDtos.CreateOrderTypeRequest;
import com.erp.trade.ordertype.dto.OrderTypeDtos.OrderTypeResponse;
import com.erp.trade.ordertype.dto.OrderTypeDtos.UpdateOrderTypeRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.trade.ordertype.dto.OrderTypeDtos;

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
