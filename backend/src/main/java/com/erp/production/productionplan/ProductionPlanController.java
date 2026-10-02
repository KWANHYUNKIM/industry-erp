package com.erp.production.productionplan;

import com.erp.production.productionplan.dto.ProductionPlanDtos.CreatePlanRequest;
import com.erp.production.productionplan.dto.ProductionPlanDtos.PlanResponse;
import com.erp.production.productionplan.dto.ProductionPlanDtos.UpdatePlanStatusRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.production.productionplan.dto.ProductionPlanDtos;

@RestController
@RequestMapping("/api/production-plans")
@RequiredArgsConstructor
public class ProductionPlanController {

    private final ProductionPlanService planService;
    private final TimePhasedPlanService timePhasedPlanService;

    /** 원본 조건 [생산계획기간]. 안 주면 전부 낸다. */
    @GetMapping
    public List<PlanResponse> list(@RequestParam(required = false) String weekFrom,
                                   @RequestParam(required = false) String weekTo) {
        return planService.findAll(weekFrom, weekTo);
    }

    /** 생산계획 삭제. 작업지시로 전환된 계획은 거부한다. */
    /**
     * 원본 생산계획현황 · MRP현황 — 날짜별 순소요 표(기초재고·입고·생산·출고·소모예정·예상재고·필요·계획수량).
     * BOM 이 있는 품목이 생산계획 쪽, 없는 품목이 MRP 쪽이다(row.producible).
     */
    @GetMapping("/time-phased")
    public com.erp.production.productionplan.dto.TimePhasedDtos.Result timePhased(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            /* [생산계획대상-전표] — 안 주면 셋 다 센다(예전 그대로). 리스트 줄에서 열면 그 줄의 고른 값을 준다. */
            @RequestParam(defaultValue = "true") boolean unsold,
            @RequestParam(defaultValue = "true") boolean unpurchased,
            @RequestParam(defaultValue = "true") boolean unproduced) {
        return timePhasedPlanService.compute(from, to, unsold, unpurchased, unproduced);
    }

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
