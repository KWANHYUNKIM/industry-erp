package com.erp.controller;

import com.erp.dto.PriceOrderDtos.PriceOrderLine;
import com.erp.dto.PriceOrderDtos.SavePriceOrderRequest;
import com.erp.service.PriceOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/price-order-settings")
@RequiredArgsConstructor
public class PriceOrderController {

    private final PriceOrderService priceOrderService;

    @GetMapping
    public List<PriceOrderLine> get(@RequestParam(defaultValue = "SALES") String category) {
        return priceOrderService.get(category);
    }

    @PutMapping
    public List<PriceOrderLine> save(@Valid @RequestBody SavePriceOrderRequest req) {
        return priceOrderService.save(req);
    }
}
