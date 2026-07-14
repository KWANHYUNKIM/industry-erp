package com.erp.controller;

import com.erp.domain.enums.FastVoucherType;
import com.erp.dto.FastVoucherDtos.CreateVoucherRequest;
import com.erp.dto.FastVoucherDtos.VoucherResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.FastVoucherService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
