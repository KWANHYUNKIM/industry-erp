package com.erp.controller;

import com.erp.dto.ProductionDtos.CreateProductionRequest;
import com.erp.dto.ProductionDtos.ProductionMaterialResponse;
import com.erp.dto.ProductionDtos.ProductionResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.ProductionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

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

    @PostMapping
    public ResponseEntity<ProductionResponse> create(
            @Valid @RequestBody CreateProductionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(productionService.create(req, principal.getUsername()));
    }
}
