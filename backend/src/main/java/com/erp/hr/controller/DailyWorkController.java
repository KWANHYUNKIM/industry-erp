package com.erp.hr.controller;

import com.erp.hr.dto.DailyWorkDtos.CreateDailyWorkRequest;
import com.erp.hr.dto.DailyWorkDtos.DailyWorkResponse;
import com.erp.hr.dto.DailyWorkDtos.DailyWorkSummary;
import com.erp.hr.dto.DailyWorkDtos.PayRequest;
import com.erp.security.UserPrincipal;
import com.erp.hr.service.DailyWorkService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.hr.dto.DailyWorkDtos;

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
    public ResponseEntity<DailyWorkResponse> create(@Valid @RequestBody CreateDailyWorkRequest req,
                                                    @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 선택한 출역들을 지급 처리 */
    @PostMapping("/pay")
    public List<DailyWorkResponse> pay(@RequestBody PayRequest req) {
        return service.pay(req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
