package com.erp.accounting.controller;

import com.erp.accounting.dto.CurrencyDtos.ConversionResponse;
import com.erp.accounting.dto.CurrencyDtos.CurrencyRequest;
import com.erp.accounting.dto.CurrencyDtos.CurrencyResponse;
import com.erp.accounting.dto.CurrencyDtos.RateRequest;
import com.erp.accounting.dto.CurrencyDtos.RateResponse;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.CurrencyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.CurrencyDtos;

/** 기초등록 > 외화 — 통화 마스터·일자별 고시환율·원화 환산 */
@RestController
@RequestMapping("/api/currencies")
@RequiredArgsConstructor
public class CurrencyController {

    private final CurrencyService service;

    @GetMapping
    public List<CurrencyResponse> currencies() {
        return service.findCurrencies();
    }

    @PostMapping
    public CurrencyResponse create(@Valid @RequestBody CurrencyRequest req) {
        return service.createCurrency(req);
    }

    @PutMapping("/{id}")
    public CurrencyResponse update(@PathVariable Long id, @Valid @RequestBody CurrencyRequest req) {
        return service.updateCurrency(id, req);
    }

    @GetMapping("/rates")
    public List<RateResponse> rates(@RequestParam(required = false) Long currencyId) {
        return service.findRates(currencyId);
    }

    @PostMapping("/rates")
    public RateResponse createRate(@Valid @RequestBody RateRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.createRate(req, principal.getUsername());
    }

    /** 외화 → 원화 환산 (기준일에 고시가 없으면 직전 고시 적용) */
    @GetMapping("/convert")
    public ConversionResponse convert(
            @RequestParam Long currencyId,
            @RequestParam BigDecimal amount,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate baseDate) {
        return service.convert(currencyId, amount, baseDate);
    }
}
