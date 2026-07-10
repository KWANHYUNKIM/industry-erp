package com.erp.controller;

import com.erp.dto.AccountingDtos.DailyProfitResponse;
import com.erp.dto.AccountingDtos.MonthlyProfitResponse;
import com.erp.service.AccountingService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 이익현황 조회. 기존 Sales/Purchase 전표를 월별/일별로 집계한다.
 */
@RestController
@RequestMapping("/api/profit")
@RequiredArgsConstructor
public class ProfitController {

    private final AccountingService accountingService;

    /** 월별 이익현황 (연도 미지정 시 올해) */
    @GetMapping("/monthly")
    public List<MonthlyProfitResponse> monthly(@RequestParam(required = false) Integer year) {
        int y = year != null ? year : LocalDate.now().getYear();
        return accountingService.monthlyProfit(y);
    }

    /** 일별 이익현황 (from~to, 미지정 시 최근 30일) */
    @GetMapping("/daily")
    public List<DailyProfitResponse> daily(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        LocalDate end = to != null ? to : LocalDate.now();
        LocalDate start = from != null ? from : end.minusDays(30);
        return accountingService.dailyProfit(start, end);
    }
}
