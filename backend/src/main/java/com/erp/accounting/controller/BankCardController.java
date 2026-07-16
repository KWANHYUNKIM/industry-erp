package com.erp.accounting.controller;

import com.erp.accounting.dto.BankCardDtos.BankAccountRequest;
import com.erp.accounting.dto.BankCardDtos.BankAccountResponse;
import com.erp.accounting.dto.BankCardDtos.BankTxnRequest;
import com.erp.accounting.dto.BankCardDtos.BankTxnResponse;
import com.erp.accounting.dto.BankCardDtos.CardUsageRequest;
import com.erp.accounting.dto.BankCardDtos.CardUsageResponse;
import com.erp.accounting.dto.BankCardDtos.CreditCardRequest;
import com.erp.accounting.dto.BankCardDtos.CreditCardResponse;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.BankCardService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.BankCardDtos;

/** 회계 I > 계좌/카드 — 계좌·카드 등록과 계좌 입출금·카드사용(자동 분개) */
@RestController
@RequestMapping("/api/bank-cards")
@RequiredArgsConstructor
public class BankCardController {

    private final BankCardService service;

    @GetMapping("/accounts")
    public List<BankAccountResponse> accounts() {
        return service.findAccounts();
    }

    @PostMapping("/accounts")
    public BankAccountResponse createAccount(@Valid @RequestBody BankAccountRequest req) {
        return service.createAccount(req);
    }

    @PutMapping("/accounts/{id}")
    public BankAccountResponse updateAccount(@PathVariable Long id, @Valid @RequestBody BankAccountRequest req) {
        return service.updateAccount(id, req);
    }

    @GetMapping("/cards")
    public List<CreditCardResponse> cards() {
        return service.findCards();
    }

    @PostMapping("/cards")
    public CreditCardResponse createCard(@Valid @RequestBody CreditCardRequest req) {
        return service.createCard(req);
    }

    @PutMapping("/cards/{id}")
    public CreditCardResponse updateCard(@PathVariable Long id, @Valid @RequestBody CreditCardRequest req) {
        return service.updateCard(id, req);
    }

    @GetMapping("/transactions")
    public List<BankTxnResponse> transactions() {
        return service.findTxns();
    }

    @PostMapping("/transactions")
    public BankTxnResponse createTxn(@Valid @RequestBody BankTxnRequest req,
                                     @AuthenticationPrincipal UserPrincipal principal) {
        return service.createTxn(req, principal.getUsername());
    }

    @GetMapping("/usages")
    public List<CardUsageResponse> usages() {
        return service.findUsages();
    }

    @PostMapping("/usages")
    public CardUsageResponse createUsage(@Valid @RequestBody CardUsageRequest req,
                                         @AuthenticationPrincipal UserPrincipal principal) {
        return service.createUsage(req, principal.getUsername());
    }
}
