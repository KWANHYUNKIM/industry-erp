package com.erp.trade.sales;

import com.erp.trade.sales.dto.SalesRepPerformanceDtos.PerformanceSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 담당자별 실적 — 전표에 붙은 사원(담당)으로 판매 · 구매를 집계한다(입력 계정이 아니다).
 * 전에는 hr 의 /api/employees/performance 였다(hr→trade 간선). 담당자가 사원(담당) 마스터로 갈라지며 trade 로 옮겼다.
 */
@RestController
@RequiredArgsConstructor
public class SalesRepPerformanceController {

    private final SalesRepPerformanceService performanceService;

    @GetMapping("/api/sales/rep-performance")
    public PerformanceSummary performance(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return performanceService.performance(from, to);
    }
}
