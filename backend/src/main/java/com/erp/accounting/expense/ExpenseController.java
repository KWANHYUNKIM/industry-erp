package com.erp.accounting.expense;

import com.erp.accounting.expense.dto.ExpenseDtos.CreateExpenseRequest;
import com.erp.accounting.expense.dto.ExpenseDtos.ExpenseResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.expense.dto.ExpenseDtos;

@RestController
@RequestMapping("/api/expenses")
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService expenseService;

    @GetMapping
    public List<ExpenseResponse> list() {
        return expenseService.findAll();
    }

    @PostMapping
    public ResponseEntity<ExpenseResponse> create(
            @Valid @RequestBody CreateExpenseRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(expenseService.create(req, principal.getUsername()));
    }

    @GetMapping("/{id}")
    public ExpenseResponse get(@PathVariable Long id) {
        return expenseService.get(id);
    }

    @PutMapping("/{id}")
    public ExpenseResponse update(@PathVariable Long id, @Valid @RequestBody CreateExpenseRequest req) {
        return expenseService.update(id, req);
    }

    /** 전표별회계반영(비용) E060814 [가지급금정산서작성] → [저장] */
    @PostMapping("/settle")
    public com.erp.accounting.fastvoucher.dto.FastVoucherDtos.VoucherResponse settle(
            @Valid @RequestBody ExpenseDtos.SettleRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return expenseService.settle(req, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        expenseService.delete(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
