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
    public CostRunResult generate(@PathVariable Long id) {
        return service.generate(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
