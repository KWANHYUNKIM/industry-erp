package com.erp.accounting.ledger.statementsheet;

import com.erp.accounting.ledger.statementsheet.dto.StatementSheetDtos.SaveLinesRequest;
import com.erp.accounting.ledger.statementsheet.dto.StatementSheetDtos.SaveSheetRequest;
import com.erp.accounting.ledger.statementsheet.dto.StatementSheetDtos.SheetResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 회계 I › 출력물 › 주요재무제표 — 현금흐름표(E010861) · 이익잉여금처분계산서(E010817). */
@RestController
@RequestMapping("/api/statement-sheets")
@RequiredArgsConstructor
public class StatementSheetController {

    private final StatementSheetService service;

    @GetMapping
    public List<SheetResponse> list(@RequestParam StatementSheetKind kind) {
        return service.list(kind);
    }

    @GetMapping("/{id}")
    public SheetResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public SheetResponse create(@Valid @RequestBody SaveSheetRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public SheetResponse update(@PathVariable Long id, @Valid @RequestBody SaveSheetRequest req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/lines")
    public SheetResponse saveLines(@PathVariable Long id, @Valid @RequestBody SaveLinesRequest req) {
        return service.saveLines(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
