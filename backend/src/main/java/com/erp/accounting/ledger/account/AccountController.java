package com.erp.accounting.ledger.account;

import com.erp.accounting.ledger.account.dto.AccountDtos.AccountResponse;
import com.erp.accounting.ledger.account.dto.AccountDtos.CreateAccountRequest;
import com.erp.accounting.ledger.account.dto.AccountDtos.UpdateAccountRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.ledger.account.dto.AccountDtos;

@RestController
@RequestMapping("/api/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @GetMapping
    public List<AccountResponse> list(@RequestParam(defaultValue = "false") boolean slip) {
        return accountService.findAll(slip);
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
