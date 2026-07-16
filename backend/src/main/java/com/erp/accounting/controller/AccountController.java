package com.erp.accounting.controller;

import com.erp.accounting.dto.AccountDtos.AccountResponse;
import com.erp.accounting.dto.AccountDtos.CreateAccountRequest;
import com.erp.accounting.dto.AccountDtos.UpdateAccountRequest;
import com.erp.accounting.service.AccountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.AccountDtos;

@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @GetMapping
    public List<AccountResponse> list() {
        return accountService.findAll();
    }

    @PostMapping
    public ResponseEntity<AccountResponse> create(@Valid @RequestBody CreateAccountRequest req) {
        return ResponseEntity.ok(accountService.create(req));
    }

    @PatchMapping("/{id}")
    public AccountResponse update(@PathVariable Long id, @Valid @RequestBody UpdateAccountRequest req) {
        return accountService.update(id, req);
    }
}
