package com.erp.accounting.ledger.account;

import com.erp.accounting.ledger.account.dto.AccountRemarkDtos.AccountRemarkRequest;
import com.erp.accounting.ledger.account.dto.AccountRemarkDtos.AccountRemarkResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 계정별 적요(계정등록 [적요] '등록' → 적요리스트). */
@RestController
@RequestMapping("/api/accounts/{accountId}/remarks")
@RequiredArgsConstructor
public class AccountRemarkController {

    private final AccountRemarkService remarkService;

    @GetMapping
    public List<AccountRemarkResponse> list(@PathVariable Long accountId) {
        return remarkService.list(accountId);
    }

    @GetMapping("/next-code")
    public Map<String, String> nextCode(@PathVariable Long accountId) {
        return Map.of("code", remarkService.nextCode(accountId));
    }

    @PostMapping
    public AccountRemarkResponse create(@PathVariable Long accountId, @Valid @RequestBody AccountRemarkRequest req) {
        return remarkService.create(accountId, req);
    }

    @PutMapping("/{id}")
    public AccountRemarkResponse update(@PathVariable Long accountId, @PathVariable Long id, @Valid @RequestBody AccountRemarkRequest req) {
        return remarkService.update(accountId, id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long accountId, @PathVariable Long id) {
        remarkService.delete(accountId, id);
        return ResponseEntity.noContent().build();
    }
}
