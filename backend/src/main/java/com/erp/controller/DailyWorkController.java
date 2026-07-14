package com.erp.controller;

import com.erp.dto.DailyWorkDtos.CreateDailyWorkRequest;
import com.erp.dto.DailyWorkDtos.DailyWorkResponse;
import com.erp.dto.DailyWorkDtos.DailyWorkSummary;
import com.erp.dto.DailyWorkDtos.PayRequest;
import com.erp.security.UserPrincipal;
import com.erp.service.DailyWorkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 일용근로급여 (관리 > 일용근로급여관리) */
@RestController
@RequestMapping("/api/daily-works")
@RequiredArgsConstructor
public class DailyWorkController {

    private final DailyWorkService service;

    /** 월별 일용직 급여대장 (month=2026-07, 생략하면 이번 달) */
    @GetMapping
    public DailyWorkSummary month(@RequestParam(required = false) String month) {
        return service.findMonth(month);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<DailyWorkResponse> create(@Valid @RequestBody CreateDailyWorkRequest req,
                                                    @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 선택한 출역들을 지급 처리 */
    @PostMapping("/pay")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public List<DailyWorkResponse> pay(@RequestBody PayRequest req) {
        return service.pay(req);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
