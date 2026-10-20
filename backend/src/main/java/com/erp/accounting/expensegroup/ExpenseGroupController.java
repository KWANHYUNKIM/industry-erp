package com.erp.accounting.expensegroup;

import com.erp.accounting.expensegroup.dto.ExpenseGroupDtos.ExpenseGroupResponse;
import com.erp.accounting.expensegroup.dto.ExpenseGroupDtos.SaveExpenseGroupRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 회계 II › 비용관리 › 비용그룹등록(E060810). */
@RestController
@RequestMapping("/api/expense-groups")
@RequiredArgsConstructor
public class ExpenseGroupController {

    private final ExpenseGroupService service;

    @GetMapping
    public List<ExpenseGroupResponse> list() { return service.findAll(); }

    @GetMapping("/next-code")
    public Map<String, String> nextCode() { return Map.of("code", service.nextCode()); }

    @PostMapping
    public ExpenseGroupResponse create(@Valid @RequestBody SaveExpenseGroupRequest req) { return service.create(req); }

    @PutMapping("/{id}")
    public ExpenseGroupResponse update(@PathVariable Long id, @Valid @RequestBody SaveExpenseGroupRequest req) {
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
