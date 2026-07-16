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
    public List<VoucherResponse> list(@RequestParam(required = false) FastVoucherType type) {
        return service.findAll(type);
    }

    @PostMapping
    public VoucherResponse create(@Valid @RequestBody CreateVoucherRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }
}
