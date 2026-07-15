package com.erp.controller;

import com.erp.dto.PriceBulkDtos.PriceBulkApplyRequest;
import com.erp.dto.PriceBulkDtos.PriceBulkApplyResponse;
import com.erp.dto.PriceBulkDtos.PriceBulkItemResponse;
import com.erp.service.PriceBulkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 판매/구매 단가일괄변경 API. (판매단가일괄변경 · 구매단가일괄변경 화면용)
 */
@RestController
@RequestMapping("/api/price-bulk")
@RequiredArgsConstructor
public class PriceBulkController {

    private final PriceBulkService priceBulkService;

    @GetMapping("/items")
    public List<PriceBulkItemResponse> items() {
        return priceBulkService.findItems();
    }

    @PostMapping("/apply")
    public PriceBulkApplyResponse apply(@Valid @RequestBody PriceBulkApplyRequest req) {
        return priceBulkService.apply(req);
    }
}
