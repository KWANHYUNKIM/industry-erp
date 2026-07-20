package com.erp.trade.controller;

import com.erp.security.UserPrincipal;
import com.erp.trade.dto.SalesPlanDtos.ComparisonRow;
import com.erp.trade.dto.SalesPlanDtos.CreateSalesPlanRequest;
import com.erp.trade.dto.SalesPlanDtos.SalesPlanResponse;
import com.erp.trade.service.SalesPlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/sales-plans")
@RequiredArgsConstructor
public class SalesPlanController {

    private final SalesPlanService service;

    /** 매출계획 목록. year 지정 시 해당 연도만. */
    @GetMapping
    public List<SalesPlanResponse> list(@RequestParam(required = false) Integer year) {
        return service.findAll(year);
    }

    /** 매출계획비교표: 계획 vs 실적(판매 집계) + 달성률. */
    @GetMapping("/comparison")
    public List<ComparisonRow> comparison(@RequestParam int year) {
        return service.comparison(year);
    }

    @PostMapping
    public ResponseEntity<SalesPlanResponse> create(
            @Valid @RequestBody CreateSalesPlanRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
