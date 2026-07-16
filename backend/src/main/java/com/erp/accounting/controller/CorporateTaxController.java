package com.erp.accounting.controller;

import com.erp.accounting.dto.CorporateTaxDtos.AddAdjustmentRequest;
import com.erp.accounting.dto.CorporateTaxDtos.CreateReturnRequest;
import com.erp.accounting.dto.CorporateTaxDtos.TaxReturnResponse;
import com.erp.accounting.dto.CorporateTaxDtos.UpdateReturnRequest;
import com.erp.security.UserPrincipal;
import com.erp.accounting.service.CorporateTaxService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.CorporateTaxDtos;

/** 법인세 (세무 > 법인세) */
@RestController
@RequestMapping("/api/corporate-tax")
@RequiredArgsConstructor
public class CorporateTaxController {

    private final CorporateTaxService service;

    @GetMapping
    public List<TaxReturnResponse> list() {
        return service.findAll();
    }

    /** 사업연도 신고서 생성. 당기순이익은 손익계산서에서 자동으로 가져온다. */
    @PostMapping
    public ResponseEntity<TaxReturnResponse> create(@Valid @RequestBody CreateReturnRequest req,
                                                    @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @PutMapping("/{id}")
    public TaxReturnResponse update(@PathVariable Long id, @RequestBody UpdateReturnRequest req) {
        return service.update(id, req);
    }

    /** 결산이 바뀌었을 때 당기순이익을 손익계산서에서 다시 가져온다. */
    @PostMapping("/{id}/refresh")
    public TaxReturnResponse refresh(@PathVariable Long id) {
        return service.refreshNetIncome(id);
    }

    @PostMapping("/{id}/adjustments")
    public TaxReturnResponse addAdjustment(@PathVariable Long id, @Valid @RequestBody AddAdjustmentRequest req) {
        return service.addAdjustment(id, req);
    }

    @DeleteMapping("/{id}/adjustments/{adjustmentId}")
    public TaxReturnResponse removeAdjustment(@PathVariable Long id, @PathVariable Long adjustmentId) {
        return service.removeAdjustment(id, adjustmentId);
    }

    @PostMapping("/{id}/confirm")
    public TaxReturnResponse confirm(@PathVariable Long id) {
        return service.confirm(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
