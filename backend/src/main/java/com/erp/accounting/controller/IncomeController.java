package com.erp.accounting.controller;

import com.erp.accounting.dto.IncomeDtos.CreateIncomeRequest;
import com.erp.accounting.dto.IncomeDtos.IncomeExpenseStatus;
import com.erp.accounting.dto.IncomeDtos.IncomeResponse;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.IncomeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.IncomeDtos;

/** 회계 II 수입비용 — 수입등록(자동 분개)과 수입비용현황. */
@RestController
@RequestMapping("/api/incomes")
@RequiredArgsConstructor
public class IncomeController {

    private final IncomeService service;

    @GetMapping
    public List<IncomeResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findAll(from, to);
    }

    @PostMapping
    public ResponseEntity<IncomeResponse> create(
            @Valid @RequestBody CreateIncomeRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 수입비용현황: 기간 내 수입·비용 계정별 집계와 순수지 */
    @GetMapping("/status")
    public IncomeExpenseStatus status(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.status(from, to);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
