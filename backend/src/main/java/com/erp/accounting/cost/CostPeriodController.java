package com.erp.accounting.cost;

import com.erp.accounting.cost.dto.CostPeriodDtos.CostPeriodResponse;
import com.erp.accounting.cost.dto.CostPeriodDtos.CostRunResult;
import com.erp.accounting.cost.dto.CostPeriodDtos.CreateCostPeriodRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 원본 이익관리 &gt; 원가생성/수정(E040802) 의 기간 줄. */
@RestController
@RequestMapping("/api/cost-periods")
@RequiredArgsConstructor
public class CostPeriodController {

    private final CostPeriodService service;

    @GetMapping
    public List<CostPeriodResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public CostPeriodResponse create(@Valid @RequestBody CreateCostPeriodRequest req) {
        return service.create(req);
    }

    @PostMapping("/{id}/standard")
    public CostRunResult standard(@PathVariable Long id) {
        return service.buildStandard(id);
    }

    @PostMapping("/{id}/generate")
    public CostRunResult generate(@PathVariable Long id,
                                  @org.springframework.security.core.annotation.AuthenticationPrincipal com.erp.security.UserPrincipal principal) {
        return service.generate(id, principal != null ? principal.getUsername() : null);
    }

    /** 원가현황 [수량비교] — 재고수량 Checklist. */
    @GetMapping("/{id}/qty-compare")
    public com.erp.accounting.cost.dto.CostPeriodDtos.Checklist<com.erp.accounting.cost.dto.CostPeriodDtos.QtyCompareRow> qtyCompare(@PathVariable Long id) {
        return service.qtyCompare(id);
    }

    /** 원가현황 [전월금액비교] — 금액비교 Checklist. */
    @GetMapping("/{id}/amount-compare")
    public com.erp.accounting.cost.dto.CostPeriodDtos.Checklist<com.erp.accounting.cost.dto.CostPeriodDtos.AmountCompareRow> amountCompare(@PathVariable Long id) {
        return service.amountCompare(id);
    }

    /** 기타 [이력]. */
    @GetMapping("/{id}/history")
    public List<com.erp.accounting.cost.dto.CostPeriodDtos.HistoryRow> history(@PathVariable Long id) {
        return service.history(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
