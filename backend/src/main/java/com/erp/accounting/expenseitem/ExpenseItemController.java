package com.erp.accounting.expenseitem;

import com.erp.accounting.expenseitem.dto.ExpenseItemDtos.ExpenseItemResponse;
import com.erp.accounting.expenseitem.dto.ExpenseItemDtos.SaveExpenseItemRequest;
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
