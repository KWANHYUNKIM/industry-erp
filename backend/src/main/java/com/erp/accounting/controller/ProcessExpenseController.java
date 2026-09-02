package com.erp.accounting.controller;

import com.erp.accounting.dto.ProcessExpenseDtos.ProcessExpenseResponse;
import com.erp.accounting.dto.ProcessExpenseDtos.SaveProcessExpenseRequest;
import com.erp.accounting.service.ProcessExpenseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 노무비/경비등록 API (원가생성/수정의 사전작업). */
@RestController
@RequestMapping("/api/process-expenses")
@RequiredArgsConstructor
public class ProcessExpenseController {

    private final ProcessExpenseService service;

    @GetMapping
    public List<ProcessExpenseResponse> list(@RequestParam(required = false) String period) {
        return service.findAll(period);
    }

    @PostMapping
    public ProcessExpenseResponse create(@Valid @RequestBody SaveProcessExpenseRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public ProcessExpenseResponse update(@PathVariable Long id, @Valid @RequestBody SaveProcessExpenseRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
