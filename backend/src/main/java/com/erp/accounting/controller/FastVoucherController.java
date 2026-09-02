package com.erp.accounting.controller;

import com.erp.accounting.domain.enums.FastVoucherType;
import com.erp.accounting.dto.FastVoucherDtos.CreateVoucherRequest;
import com.erp.accounting.dto.FastVoucherDtos.VoucherResponse;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.FastVoucherService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.FastVoucherDtos;

/** 회계 I > FastEntry — 지출결의서 · 입금보고서 · 가지급금정산서 */
@RestController
@RequestMapping("/api/vouchers")
@RequiredArgsConstructor
public class FastVoucherController {

    private final FastVoucherService service;

    @GetMapping
    public List<VoucherResponse> list(@RequestParam(required = false) FastVoucherType type,
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findAll(type, from, to);
    }

    @PostMapping
    public VoucherResponse create(@Valid @RequestBody CreateVoucherRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }
}
