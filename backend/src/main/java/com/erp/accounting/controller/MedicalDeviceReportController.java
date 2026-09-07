package com.erp.accounting.controller;

import com.erp.accounting.dto.MedicalDeviceDtos.ReportResponse;
import com.erp.accounting.dto.MedicalDeviceDtos.SupplyLine;
import com.erp.accounting.service.MedicalDeviceReportService;
import com.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 의료기기공급내역보고 — 공급내역 산출 + 보고파일(CSV) 생성·이력. 대외 전송은 하지 않는다. */
@RestController
@RequestMapping("/api/medical-device-reports")
@RequiredArgsConstructor
public class MedicalDeviceReportController {

    private final MedicalDeviceReportService service;

    /** 기간 공급내역(보고 대상 라인) */
    @GetMapping("/lines")
    public List<SupplyLine> lines(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String supplyType,
            @RequestParam(required = false) Long partnerId) {
        return service.lines(from, to, supplyType, partnerId);
    }

    /** 송신이력(보고파일 산출 이력) */
    @GetMapping
    public List<ReportResponse> history() {
        return service.history();
    }

    /** 보고기준월(yyyy-MM)의 공급내역을 확정해 보고파일을 만든다. */
    @PostMapping
    public ResponseEntity<ReportResponse> generate(@RequestParam String reportMonth,
                                                   @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.generate(reportMonth, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
