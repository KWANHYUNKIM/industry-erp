package com.erp.hr.payroll;

import com.erp.hr.payroll.dto.PayLedgerDtos.CalculateResult;
import com.erp.hr.payroll.dto.PayLedgerDtos.CreateLedgerRequest;
import com.erp.hr.payroll.dto.PayLedgerDtos.LedgerResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 원본 관리 &gt; 급여작업 &gt; 급여계산/대장 — 대장 목록 · 신규 · 전체계산 · 확정 · 삭제. */
@RestController
@RequestMapping("/api/pay-ledgers")
@RequiredArgsConstructor
public class PayLedgerController {

    private final PayLedgerService service;

    @GetMapping
    public List<LedgerResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public LedgerResponse create(@Valid @RequestBody CreateLedgerRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    @PostMapping("/{id}/calculate")
    public CalculateResult calculate(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.calculate(id, principal.getUsername());
    }

    @PostMapping("/{id}/confirm")
    public LedgerResponse confirm(@PathVariable Long id) {
        return service.confirm(id);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
