package com.erp.controller;

import com.erp.dto.ProductionPlanDtos.CreatePlanRequest;
import com.erp.dto.ProductionPlanDtos.PlanResponse;
import com.erp.dto.ProductionPlanDtos.UpdatePlanStatusRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.ProductionPlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/production-plans")
@RequiredArgsConstructor
public class ProductionPlanController {

    private final ProductionPlanService planService;

    @GetMapping
    public List<PlanResponse> list() {
        return planService.findAll();
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

    @PostMapping("/{id}/work-order")
    public PlanResponse generateWorkOrder(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return planService.generateWorkOrder(id, principal.getUsername());
    }
}
