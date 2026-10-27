package com.erp.accounting.expenseitem;

import com.erp.accounting.expenseitem.dto.ExpenseItemDtos.ExpenseItemResponse;
import com.erp.accounting.expenseitem.dto.ExpenseItemDtos.SaveExpenseItemRequest;
import com.erp.accounting.expenseitem.dto.ExpenseItemDtos.BulkSaveRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 회계 II › 비용관리 › 비용등록(E060809). */
@RestController
@RequestMapping("/api/expense-items")
@RequiredArgsConstructor
public class ExpenseItemController {

    private final ExpenseItemService service;

    @GetMapping
    public List<ExpenseItemResponse> list() { return service.findAll(); }

    @PostMapping
    public ExpenseItemResponse create(@Valid @RequestBody SaveExpenseItemRequest req) { return service.create(req); }

    @PutMapping("/{id}")
    public ExpenseItemResponse update(@PathVariable Long id, @Valid @RequestBody SaveExpenseItemRequest req) {
        return service.update(id, req);
    }

    /** 비용일괄등록(E060811) [저장(F8)] — 고친 줄을 한 번에(한 트랜잭션). 바뀐 줄 수를 돌려준다. */
    @PutMapping("/bulk")
    public java.util.Map<String, Integer> bulk(@Valid @RequestBody BulkSaveRequest req) {
        return java.util.Map.of("changed", service.bulkUpdate(req.changes()));
    }

    @PostMapping("/active")
    public ResponseEntity<Void> setActive(@RequestParam boolean active, @RequestBody List<Long> ids) {
        service.setActive(ids, active);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }
}
