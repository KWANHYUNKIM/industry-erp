package com.erp.controller;

import com.erp.dto.CostDtos.CostResponse;
import com.erp.dto.CostDtos.CreateCostRequest;
import com.erp.dto.CostDtos.UpdateCostRequest;
import com.erp.service.CostService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<CostResponse> create(@Valid @RequestBody CreateCostRequest req) {
        return ResponseEntity.ok(costService.create(req));
    }

    /** 표준원가 자동 생성 (seed 품목 기준단가 기반) */
    @PostMapping("/build")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public List<CostResponse> build(@RequestParam String period) {
        return costService.build(period);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public CostResponse update(@PathVariable Long id, @Valid @RequestBody UpdateCostRequest req) {
        return costService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        costService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
