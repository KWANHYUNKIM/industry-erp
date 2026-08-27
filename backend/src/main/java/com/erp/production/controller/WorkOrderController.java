package com.erp.production.controller;

import com.erp.production.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.production.dto.ProductionDtos.WorkOrderResponse;
import com.erp.security.UserPrincipal;
import com.erp.production.service.WorkOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.production.dto.ProductionDtos;

@RestController
@RequestMapping("/api/work-orders")
@RequiredArgsConstructor
public class WorkOrderController {

    private final WorkOrderService workOrderService;

    @GetMapping
    public List<WorkOrderResponse> list() {
        return workOrderService.findAll();
    }

    /** 작업지시 삭제. 생산실적이 붙어 있으면 거부한다. */
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
