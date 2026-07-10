package com.erp.controller;

import com.erp.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.dto.ProductionDtos.WorkOrderResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.WorkOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/work-orders")
@RequiredArgsConstructor
public class WorkOrderController {

    private final WorkOrderService workOrderService;

    @GetMapping
    public List<WorkOrderResponse> list() {
        return workOrderService.findAll();
    }

    @PostMapping
    public ResponseEntity<WorkOrderResponse> create(
            @Valid @RequestBody CreateWorkOrderRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(workOrderService.create(req, principal.getUsername()));
    }
}
