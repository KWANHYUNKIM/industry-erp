package com.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class EmployeePerformanceDtos {

    private EmployeePerformanceDtos() {}

    /** 담당자 한 줄. employeeId 가 null 이면 담당자 미지정 전표를 모은 행이다. */
    public record PerformanceRow(
            Long employeeId, String employeeCode, String employeeName, String department,
            int salesCount, BigDecimal salesAmount,
            int purchaseCount, BigDecimal purchaseAmount,
            BigDecimal salesShare
    ) {}

    public record PerformanceSummary(
            LocalDate from, LocalDate to,
            BigDecimal totalSales,
            BigDecimal totalPurchase,
            List<PerformanceRow> rows
    ) {}
}
