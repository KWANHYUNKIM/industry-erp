package com.erp.controller;

import com.erp.dto.FieldWorkDtos.CreateFieldWorkRequest;
import com.erp.dto.FieldWorkDtos.FieldWorkResponse;
import com.erp.dto.FieldWorkDtos.FieldWorkSummary;
import com.erp.dto.FieldWorkDtos.RejectRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.FieldWorkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

/** 외근조회 — 외근계 신청·승인·반려. 근태와 나란히 본다. */
@RestController
@RequestMapping("/api/field-works")
@RequiredArgsConstructor
public class FieldWorkController {

    private final FieldWorkService service;

    @GetMapping
    public FieldWorkSummary list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.find(from, to);
    }

    @PostMapping
    public ResponseEntity<FieldWorkResponse> create(
            @Valid @RequestBody CreateFieldWorkRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @PostMapping("/{id}/approve")
    public FieldWorkResponse approve(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return service.approve(id, principal.getUsername());
    }

    @PostMapping("/{id}/reject")
    public FieldWorkResponse reject(@PathVariable Long id, @Valid @RequestBody RejectRequest req,
                                    @AuthenticationPrincipal UserPrincipal principal) {
        return service.reject(id, req, principal.getUsername());
    }

    /** 신청 취소 (본인·승인 전) */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancel(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        service.cancel(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
