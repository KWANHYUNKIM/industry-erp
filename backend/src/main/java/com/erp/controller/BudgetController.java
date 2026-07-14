package com.erp.controller;

import com.erp.dto.BudgetDtos.BudgetRequest;
import com.erp.dto.BudgetDtos.BudgetRow;
import com.erp.dto.BudgetDtos.BudgetStatus;
import com.erp.dto.BudgetDtos.CashPlanRequest;
import com.erp.dto.BudgetDtos.CashPlanRow;
import com.erp.dto.BudgetDtos.CashPlanStatus;
import com.erp.dto.BudgetDtos.UpdateBudgetRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.BudgetService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 회계 II — 예산관리(계정별 편성·집행률) · 자금계획(월별 수지계획 대비 실적). */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class BudgetController {

    private final BudgetService service;

    // ── 예산관리 ──

    @GetMapping("/budgets")
    public BudgetStatus budgets(@RequestParam String period) {
        return service.budgets(period);
    }

    @PostMapping("/budgets")
    public ResponseEntity<BudgetRow> createBudget(
            @Valid @RequestBody BudgetRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.createBudget(req, principal.getUsername()));
    }

    @PutMapping("/budgets/{id}")
    public BudgetRow updateBudget(@PathVariable Long id, @Valid @RequestBody UpdateBudgetRequest req) {
        return service.updateBudget(id, req);
    }

    @DeleteMapping("/budgets/{id}")
    public ResponseEntity<Void> deleteBudget(@PathVariable Long id) {
        service.deleteBudget(id);
        return ResponseEntity.noContent().build();
    }

    // ── 자금계획 ──

    @GetMapping("/cash-plans")
    public CashPlanStatus cashPlans(@RequestParam String period) {
        return service.cashPlans(period);
    }

    @PostMapping("/cash-plans")
    public ResponseEntity<CashPlanRow> createCashPlan(
            @Valid @RequestBody CashPlanRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.createCashPlan(req, principal.getUsername()));
    }

    @DeleteMapping("/cash-plans/{id}")
    public ResponseEntity<Void> deleteCashPlan(@PathVariable Long id) {
        service.deleteCashPlan(id);
        return ResponseEntity.noContent().build();
    }
}
