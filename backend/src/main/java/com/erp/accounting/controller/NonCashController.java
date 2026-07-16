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
    public List<NonCashResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public NonCashResponse create(@Valid @RequestBody CreateNonCashRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }
}
