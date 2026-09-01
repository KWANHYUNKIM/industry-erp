package com.erp.accounting.controller;

import com.erp.accounting.dto.NonCashDtos.CreateNonCashRequest;
import com.erp.accounting.dto.NonCashDtos.NonCashResponse;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.NonCashService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.NonCashDtos;

/** 회계 I > 비현금거래(대체전표) — 상계·대손·미지급 계상·계정대체 */
@RestController
@RequestMapping("/api/non-cash")
@RequiredArgsConstructor
public class NonCashController {

    private final NonCashService service;

    @GetMapping
    public List<NonCashResponse> list(
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findAll(from, to);
    }

    @PostMapping
    public NonCashResponse create(@Valid @RequestBody CreateNonCashRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }
}
