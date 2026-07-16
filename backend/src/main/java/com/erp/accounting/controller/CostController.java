package com.erp.accounting.controller;

import com.erp.accounting.dto.CostDtos.CostResponse;
import com.erp.accounting.dto.CostDtos.CreateCostRequest;
import com.erp.accounting.dto.CostDtos.UpdateCostRequest;
import com.erp.accounting.service.CostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.CostDtos;

@RestController
@RequestMapping("/api/costs")
@RequiredArgsConstructor
public class CostController {

    private final CostService costService;

    /** 품목별 원가 조회 (기간 선택) */
    @GetMapping
    public List<CostResponse> list(@RequestParam(required = false) String period) {
        return costService.findAll(period);
    }

    @PostMapping
    public ResponseEntity<CostResponse> create(@Valid @RequestBody CreateCostRequest req) {
        return ResponseEntity.ok(costService.create(req));
    }

    /** 표준원가 자동 생성 (seed 품목 기준단가 기반) */
    @PostMapping("/build")
    public List<CostResponse> build(@RequestParam String period) {
        return costService.build(period);
    }

    @PutMapping("/{id}")
    public CostResponse update(@PathVariable Long id, @Valid @RequestBody UpdateCostRequest req) {
        return costService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        costService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
