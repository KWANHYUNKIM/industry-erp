package com.erp.accounting.fund.budget;

import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetAccountDetail;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetAccountRow;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetReport;
import com.erp.accounting.fund.budget.dto.BudgetDtos.DeleteBudgetRequest;
import com.erp.accounting.fund.budget.dto.BudgetDtos.SaveBudgetRequest;
import com.erp.accounting.fund.budget.dto.BudgetDtos.CashPlanRequest;
import com.erp.accounting.fund.budget.dto.BudgetDtos.CashPlanRow;
import com.erp.accounting.fund.budget.dto.BudgetDtos.CashPlanStatus;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.fund.budget.dto.BudgetDtos;

/** 회계 II — 예산관리(해 × 계정 × 부서 × 프로젝트 × 12달) · 자금계획(월별 수지계획 대비 실적). */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class BudgetController {

    private final BudgetService service;

    // ── 예산관리(월별예산조회 · 출력물) ──

    @GetMapping("/budget-plans")
    public List<BudgetAccountRow> budgetAccounts(@RequestParam int year) {
        return service.budgetAccounts(year);
    }

    @GetMapping("/budget-plans/account")
    public BudgetAccountDetail budgetAccount(@RequestParam int year, @RequestParam Long accountId) {
        return service.budgetAccount(year, accountId);
    }

    @PutMapping("/budget-plans/account")
    public BudgetAccountDetail saveBudgetAccount(@Valid @RequestBody SaveBudgetRequest req) {
        return service.saveBudgetAccount(req);
    }

    @PostMapping("/budget-plans/delete")
    public ResponseEntity<Void> deleteBudgetAccounts(@Valid @RequestBody DeleteBudgetRequest req) {
        service.deleteBudgetAccounts(req);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/budget-plans/report")
    public BudgetReport budgetReport(@RequestParam int fromYear, @RequestParam int toYear) {
        return service.budgetReport(fromYear, toYear);
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
