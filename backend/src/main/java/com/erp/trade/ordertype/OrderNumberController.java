package com.erp.trade.ordertype;

import com.erp.trade.ordertype.dto.OrderNumberDtos.CompleteOrderNumbersRequest;
import com.erp.trade.ordertype.dto.OrderNumberDtos.CreateOrderNumberRequest;
import com.erp.trade.ordertype.dto.OrderNumberDtos.OrderNumberResponse;
import com.erp.trade.ordertype.dto.OrderNumberDtos.UpdateOrderNumberRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** 재고2 오더관리진행단계(E040904)의 오더관리번호. */
@RestController
@RequestMapping("/api/order-numbers")
@RequiredArgsConstructor
public class OrderNumberController {

    private final OrderNumberService orderNumberService;

    @GetMapping
    public List<OrderNumberResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return orderNumberService.findAll(from, to);
    }

    @GetMapping("/next-no")
    public Map<String, String> nextNo() {
        return Map.of("orderNo", orderNumberService.nextNo());
    }

    @GetMapping("/exists")
    public Map<String, Boolean> exists(@RequestParam String orderNo) {
        return Map.of("exists", orderNumberService.exists(orderNo));
    }

    @PostMapping
    public OrderNumberResponse create(@Valid @RequestBody CreateOrderNumberRequest req) {
        return orderNumberService.create(req);
    }

    @PutMapping("/{id}")
    public OrderNumberResponse update(@PathVariable Long id, @Valid @RequestBody UpdateOrderNumberRequest req) {
        return orderNumberService.update(id, req);
    }

    @PostMapping("/complete")
    public ResponseEntity<Void> complete(@Valid @RequestBody CompleteOrderNumbersRequest req) {
        orderNumberService.complete(req.ids());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        orderNumberService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
