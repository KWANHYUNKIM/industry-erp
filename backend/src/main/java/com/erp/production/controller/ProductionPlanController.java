package com.erp.production.controller;

import com.erp.production.dto.ProductionPlanDtos.CreatePlanRequest;
import com.erp.production.dto.ProductionPlanDtos.PlanResponse;
import com.erp.production.dto.ProductionPlanDtos.UpdatePlanStatusRequest;
import com.erp.security.UserPrincipal;
import com.erp.production.service.ProductionPlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.production.dto.ProductionPlanDtos;

@RestController
@RequestMapping("/api/production-plans")
@RequiredArgsConstructor
public class ProductionPlanController {

    private final ProductionPlanService planService;

    @GetMapping
    public List<PlanResponse> list() {
        return planService.findAll();
    }

    /** 생산계획 삭제. 작업지시로 전환된 계획은 거부한다. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        planService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<PlanResponse> create(
            @Valid @RequestBody CreatePlanRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(planService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}/status")
    public PlanResponse updateStatus(@PathVariable Long id, @Valid @RequestBody UpdatePlanStatusRequest req) {
        return planService.updateStatus(id, req.status());
    }

    /** 원본 [생산계획/MRP생성] — 미판매 잔량에서 재고를 뺀 부족분만큼 계획을 만든다. */
    @PostMapping("/generate")
    public ProductionPlanDtos.GenerateResult generate(
            @Valid @RequestBody ProductionPlanDtos.GeneratePlanRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return planService.generateFromUnsold(req, principal.getUsername());
    }

    @PostMapping("/{id}/work-order")
    public PlanResponse generateWorkOrder(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return planService.generateWorkOrder(id, principal.getUsername());
    }
}
