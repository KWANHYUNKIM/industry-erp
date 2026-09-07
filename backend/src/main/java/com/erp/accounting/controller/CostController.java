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
    /** 실제원가 계산 — 그 달 생산실적과 노무비/경비등록에서 낸다. 원본의 [생성]. */
    @PostMapping("/actual")
    public List<CostResponse> calcActual(@RequestParam String period) {
        return costService.calcActual(period);
    }

    /**
     * 표준원가생성. {@code basis} 는 원본 원가생성/수정의 [계산기준] 이다 —
     * WEIGHTED_AVG(총평균법) 또는 안 주면 최종매입가.
     */
    @PostMapping("/build")
    public List<CostResponse> build(@RequestParam String period,
                                    @RequestParam(required = false) String basis) {
        return costService.build(period, basis);
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
