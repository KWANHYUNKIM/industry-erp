package com.erp.groupware.controller;

import com.erp.groupware.dto.SupplyUsageDtos.CreateSupplyUsageRequest;
import com.erp.groupware.dto.SupplyUsageDtos.SupplyUsageResponse;
import com.erp.groupware.dto.SupplyUsageDtos.UpdateSupplyUsageRequest;
import com.erp.groupware.service.SupplyUsageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 그룹웨어 &gt; 사내관리 &gt; 공용품관리 — 공용품 사용/반납 내역. */
@RestController
@RequestMapping("/api/supply-usages")
@RequiredArgsConstructor
public class SupplyUsageController {

    private final SupplyUsageService service;

    @GetMapping
    public List<SupplyUsageResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long supplyItemId,
            @RequestParam(required = false) Long userId) {
        return service.search(from, to, supplyItemId, userId);
    }

    @PostMapping
    public ResponseEntity<SupplyUsageResponse> create(@Valid @RequestBody CreateSupplyUsageRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public SupplyUsageResponse update(@PathVariable Long id, @Valid @RequestBody UpdateSupplyUsageRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
