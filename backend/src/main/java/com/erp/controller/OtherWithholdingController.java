package com.erp.controller;

import com.erp.dto.OtherWithholdingDtos.CreateWithholdingRequest;
import com.erp.dto.OtherWithholdingDtos.MonthlySummary;
import com.erp.dto.OtherWithholdingDtos.OtherWithholdingResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.OtherWithholdingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** 기타원천세 (세무 > 기타원천세) — 사업·기타·이자·배당소득 지급 시 원천징수 */
@RestController
@RequestMapping("/api/other-withholdings")
@RequiredArgsConstructor
public class OtherWithholdingController {

    private final OtherWithholdingService service;

    /** 월별 기타원천세 (month=2026-07, 생략하면 이번 달) */
    @GetMapping
    public MonthlySummary month(@RequestParam(required = false) String month) {
        return service.findMonth(month);
    }

    @PostMapping
    public ResponseEntity<OtherWithholdingResponse> create(@Valid @RequestBody CreateWithholdingRequest req,
                                                           @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
