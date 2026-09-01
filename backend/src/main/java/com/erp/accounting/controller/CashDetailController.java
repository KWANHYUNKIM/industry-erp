package com.erp.accounting.controller;

import com.erp.accounting.dto.BankCardDtos.CardUsageResponse;
import com.erp.accounting.dto.CashDetailDtos.AccountTransferRequest;
import com.erp.accounting.dto.CashDetailDtos.AccountTransferResponse;
import com.erp.accounting.dto.CashDetailDtos.CardPaymentRequest;
import com.erp.accounting.dto.CashDetailDtos.CardPaymentResponse;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.CashDetailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.BankCardDtos;
import com.erp.accounting.dto.CashDetailDtos;

/** 회계 I > 현금거래 세분류 — 계좌간이동 · 법인카드 대금결제 */
@RestController
@RequestMapping("/api/cash-details")
@RequiredArgsConstructor
public class CashDetailController {

    private final CashDetailService service;

    @GetMapping("/account-transfers")
    public List<AccountTransferResponse> transfers(
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findTransfers(from, to);
    }

    @PostMapping("/account-transfers")
    public AccountTransferResponse transfer(@Valid @RequestBody AccountTransferRequest req,
                                            @AuthenticationPrincipal UserPrincipal principal) {
        return service.transfer(req, principal.getUsername());
    }

    @GetMapping("/card-payments")
    public List<CardPaymentResponse> payments(
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findPayments(from, to);
    }

    /** 해당 카드의 미결제 사용내역 */
    @GetMapping("/card-payments/unpaid")
    public List<CardUsageResponse> unpaid(@RequestParam Long cardId) {
        return service.unpaidUsages(cardId);
    }

    @PostMapping("/card-payments")
    public CardPaymentResponse payCard(@Valid @RequestBody CardPaymentRequest req,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        return service.payCard(req, principal.getUsername());
    }
}
