package com.erp.accounting.cost.expensecontrol;

import com.erp.accounting.cost.expensecontrol.dto.ExpenseControlDtos.ControlTypeResponse;
import com.erp.accounting.cost.expensecontrol.dto.ExpenseControlDtos.SaveControlTypeRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 회계 II › 비용관리 › 통제유형등록(E060808). */
@RestController
@RequestMapping("/api/expense-control-types")
@RequiredArgsConstructor
public class ExpenseControlController {

    private final ExpenseControlService service;

    @GetMapping
    public List<ControlTypeResponse> list() { return service.findAll(); }

    @PostMapping
    public ControlTypeResponse create(@Valid @RequestBody SaveControlTypeRequest req) { return service.create(req); }

    @PutMapping("/{id}")
    public ControlTypeResponse update(@PathVariable Long id, @Valid @RequestBody SaveControlTypeRequest req) {
        return service.update(id, req);
    }

    /** [사용중단/재사용 ▴] 메뉴 — 사용중단 · 재사용 */
    @PostMapping("/active")
    public ResponseEntity<Void> setActive(@RequestParam boolean active, @RequestBody List<Long> ids) {
        service.setActive(ids, active);
        return ResponseEntity.noContent().build();
    }

    /** [사용중단/재사용 ▴] 메뉴 — 삭제('삭제하겠습니까?') */
    @PostMapping("/delete")
    public ResponseEntity<Void> delete(@RequestBody List<Long> ids) {
        service.delete(ids);
        return ResponseEntity.noContent().build();
    }
}
