package com.erp.production.controller;

import com.erp.production.dto.ProductionDtos.CreateProductionBatchRequest;
import com.erp.production.dto.ProductionDtos.CreateProductionRequest;
import com.erp.production.dto.ProductionDtos.ProductionMaterialResponse;
import com.erp.production.dto.ProductionDtos.ProductionResponse;
import com.erp.security.UserPrincipal;
import com.erp.production.service.ProductionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import com.erp.production.dto.ProductionDtos;

@RestController
@RequestMapping("/api/productions")
@RequiredArgsConstructor
public class ProductionController {

    private final ProductionService productionService;

    @GetMapping
    public List<ProductionResponse> list() {
        return productionService.findAll();
    }

    /** 생산수량에 대한 예상 소요자재 */
    @GetMapping("/preview")
    public List<ProductionMaterialResponse> preview(
            @RequestParam Long workOrderId,
            @RequestParam BigDecimal qty) {
        return productionService.materialPreview(workOrderId, qty);
    }

    /** 생산실적 삭제. 재고와 작업지시 진척을 함께 되돌린다. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, java.security.Principal principal) {
        productionService.delete(id, principal != null ? principal.getName() : null);
        return ResponseEntity.noContent().build();
    }

    /** 원본 생산입고 II·III 의 격자 — 한 번에 여러 줄. 한 줄이라도 막히면 전부 되돌린다. */
    @PostMapping("/batch")
    public ResponseEntity<java.util.List<ProductionResponse>> createBatch(
            @Valid @RequestBody CreateProductionBatchRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(productionService.createBatch(req, principal.getUsername()));
    }

    @PostMapping
    public ResponseEntity<ProductionResponse> create(
            @Valid @RequestBody CreateProductionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(productionService.create(req, principal.getUsername()));
    }
}
