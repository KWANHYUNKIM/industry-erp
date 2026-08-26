package com.erp.trade.controller;

import com.erp.trade.dto.PriceBulkDtos.PriceBulkApplyRequest;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkApplyResponse;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkItemResponse;
import com.erp.trade.service.PriceBulkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.PriceBulkDtos;

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

    /** 전표 라인 조회. 원본 단가일괄변경의 [검색(F8)] 에 해당한다. */
    @GetMapping("/lines")
    public List<PriceBulkDtos.SlipLineRow> lines(
            @RequestParam(defaultValue = "SALES") String tradeType,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long partnerId,
            @RequestParam(required = false) Long itemId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(defaultValue = "ALL") String status) {
        return priceBulkService.findSlipLines(tradeType, from, to, partnerId, itemId, warehouseId, status);
    }

    /** 전표 라인 단가 저장(F8). 금액이 그 자리에서 다시 계산된다. */
    @PutMapping("/lines")
    public PriceBulkDtos.SlipPriceApplyResponse applyLines(
            @Valid @RequestBody PriceBulkDtos.SlipPriceApplyRequest req) {
        return priceBulkService.applySlipPrices(req);
    }

    @PostMapping("/apply")
    public PriceBulkApplyResponse apply(@Valid @RequestBody PriceBulkApplyRequest req) {
        return priceBulkService.apply(req);
    }
}
