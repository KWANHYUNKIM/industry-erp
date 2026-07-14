package com.erp.controller;

import com.erp.dto.ExportDtos.CreateExportRequest;
import com.erp.dto.ExportDtos.CustomsRequest;
import com.erp.dto.ExportDtos.ExportResponse;
import com.erp.dto.ExportDtos.ExportSummary;
import com.erp.dto.ExportDtos.PayRequest;
import com.erp.dto.ExportDtos.ShipRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.ExportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 수출관리 (재고 II) — 인보이스 발행 → 통관진행 → 선적완료 → 입금완료. */
@RestController
@RequestMapping("/api/exports")
@RequiredArgsConstructor
public class ExportController {

    private final ExportService service;

    @GetMapping
    public ExportSummary list() {
        return service.findAll();
    }

    /** 인보이스 발행 (원화 환산은 발행일 고시환율로 고정) */
    @PostMapping
    public ResponseEntity<ExportResponse> create(
            @Valid @RequestBody CreateExportRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @PostMapping("/{id}/customs")
    public ExportResponse customs(@PathVariable Long id, @Valid @RequestBody CustomsRequest req) {
        return service.customs(id, req);
    }

    @PostMapping("/{id}/ship")
    public ExportResponse ship(@PathVariable Long id, @Valid @RequestBody ShipRequest req) {
        return service.ship(id, req);
    }

    @PostMapping("/{id}/pay")
    public ExportResponse pay(@PathVariable Long id, @RequestBody(required = false) PayRequest req) {
        return service.pay(id, req);
    }
}
