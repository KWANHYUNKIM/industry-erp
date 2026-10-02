package com.erp.production.workorder;

import com.erp.production.production.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.production.production.dto.ProductionDtos.WorkOrderResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.production.dto.ProductionDtos;

@RestController
@RequestMapping("/api/work-orders")
@RequiredArgsConstructor
public class WorkOrderController {

    private final WorkOrderService workOrderService;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    /**
     * 고르는 칸에 쓸 목록. 화면이 <code>&lt;select&gt;</code> 하나를 그리려고
     * 작업지시 전체(937KB)를 받던 자리를 대신한다.
     */
    @GetMapping("/options")
    public List<com.erp.production.production.dto.ProductionDtos.WorkOrderOption> options() {
        return workOrderService.findOptions();
    }

    @GetMapping
    public List<WorkOrderResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return workOrderService.findAll(from, to);
    }

    /** 작업지시 삭제. 생산실적이 붙어 있으면 거부한다. */
    /** 전표 하나(같은 번호의 줄들). 원본 작업지시서조회에서 번호를 눌러 여는 것. */
    @GetMapping("/slips/{orderNo}")
    public List<WorkOrderResponse> slip(@PathVariable String orderNo) {
        return workOrderService.findSlip(orderNo);
    }

    /** 원본 작업지시서입력 [저장] — 줄이 몇 개든 번호 하나. */
    @PostMapping("/slips")
    public ResponseEntity<List<WorkOrderResponse>> createSlip(
            @Valid @RequestBody com.erp.production.production.dto.ProductionDtos.SaveWorkOrderSlipRequest req,
            @AuthenticationPrincipal com.erp.security.UserPrincipal principal) {
        return ResponseEntity.ok(workOrderService.createSlip(req, principal.getUsername()));
    }

    /** 연 전표를 고쳐 [저장]. */
    @PutMapping("/slips/{orderNo}")
    public List<WorkOrderResponse> updateSlip(
            @PathVariable String orderNo,
            @Valid @RequestBody com.erp.production.production.dto.ProductionDtos.SaveWorkOrderSlipRequest req,
            @AuthenticationPrincipal com.erp.security.UserPrincipal principal) {
        return workOrderService.updateSlip(orderNo, req, principal.getUsername());
    }

    /** 전표째 [삭제]. 생산실적이 있는 줄이 있으면 막는다. */
    @DeleteMapping("/slips/{orderNo}")
    public ResponseEntity<Void> deleteSlip(@PathVariable String orderNo) {
        workOrderService.deleteSlip(orderNo);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        workOrderService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<WorkOrderResponse> create(
            @Valid @RequestBody CreateWorkOrderRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(workOrderService.create(req, principal.getUsername()));
    }
}
