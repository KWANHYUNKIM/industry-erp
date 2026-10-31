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

    /** 비용내역입력(E060812) 전표 한 장 — 머리 + 줄 여럿 */
    @PostMapping("/slip")
    public List<ExpenseResponse> createSlip(@Valid @RequestBody ExpenseDtos.SlipRequest req,
                                            @AuthenticationPrincipal UserPrincipal principal) {
        return expenseService.createSlip(req, principal.getUsername());
    }

    /** 비용내역수정 창 — {id} 는 그 전표의 아무 줄 */
    @PutMapping("/{id}/slip")
    public List<ExpenseResponse> updateSlip(@PathVariable Long id, @Valid @RequestBody ExpenseDtos.SlipRequest req) {
        return expenseService.updateSlip(id, req);
    }

    /** 비용통제 — 저장 전에 화면이 묻는다(한도 · 사용인원). editingId 는 고치는 전표(그 금액은 누적에서 뺀다). */
    @PostMapping("/slip/control-check")
    public List<ExpenseDtos.ControlViolation> controlCheck(@Valid @RequestBody ExpenseDtos.SlipRequest req,
                                                           @RequestParam(required = false) Long editingId) {
        return expenseService.checkControl(req, editingId);
    }

    /** 전표별회계반영(비용) E060814 [가지급금정산서작성] → [저장] */
    @PostMapping("/settle")
    public com.erp.accounting.fastvoucher.dto.FastVoucherDtos.VoucherResponse settle(
            @Valid @RequestBody ExpenseDtos.SettleRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return expenseService.settle(req, principal.getUsername());
    }

    /** 전표별회계반영(비용) 여러 전표 [가지급금정산서작성] → '전표 일괄 생성을 진행하겠습니까?' [확인] — 전표 한 장마다 정산서 한 장 */
    @PostMapping("/settle-batch")
    public List<com.erp.accounting.fastvoucher.dto.FastVoucherDtos.VoucherResponse> settleBatch(
            @Valid @RequestBody ExpenseDtos.BatchSettleRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return expenseService.settleBatch(req, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        expenseService.delete(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
