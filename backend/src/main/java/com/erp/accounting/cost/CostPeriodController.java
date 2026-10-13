package com.erp.accounting.cost;

import com.erp.accounting.cost.dto.CostPeriodDtos.CostPeriodResponse;
import com.erp.accounting.cost.dto.CostPeriodDtos.CostRunResult;
import com.erp.accounting.cost.dto.CostPeriodDtos.CreateCostPeriodRequest;
import com.erp.accounting.cost.dto.CostPeriodDtos.Ledger;
import com.erp.accounting.cost.dto.CostPeriodDtos.LedgerDetail;
import com.erp.accounting.cost.dto.CostPeriodDtos.UpdateLedgerRequest;
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

    /** 원가계산 [수정] → 대상 [적용] — 원가계산내역. processId 를 주면 그 공정 품목만(선택공정). */
    @GetMapping("/{id}/ledger")
    public Ledger ledger(@PathVariable Long id, @RequestParam(required = false) Long processId) {
        return service.ledger(id, processId);
    }

    /** 원가계산 [기말금액재계산] → 대상 [적용]. */
    @PostMapping("/{id}/ledger/recalc")
    public Ledger recalc(@PathVariable Long id, @RequestParam(required = false) Long processId) {
        return service.recalcClosing(id, processId);
    }

    /** 원가계산내역 체크 → [변경] 원가수정 창. */
    @GetMapping("/{id}/ledger/{itemId}")
    public LedgerDetail ledgerDetail(@PathVariable Long id, @PathVariable Long itemId) {
        return service.ledgerDetail(id, itemId);
    }

    @PutMapping("/{id}/ledger/{itemId}")
    public LedgerDetail updateLedger(@PathVariable Long id, @PathVariable Long itemId, @Valid @RequestBody UpdateLedgerRequest req) {
        return service.updateLedger(id, itemId, req);
    }

    @DeleteMapping("/{id}/ledger/{itemId}")
    public ResponseEntity<Void> deleteLedger(@PathVariable Long id, @PathVariable Long itemId) {
        service.deleteLedger(id, itemId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
