package com.erp.accounting.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class ProjectProfitDtos {

    /** 프로젝트 한 건의 손익. 매출은 판매전표, 원가는 구매전표, 비용은 비용전표에서 모은다. */
    public record ProjectProfitRow(
            Long projectId,
            String projectCode,
            String projectName,
            String status,
            BigDecimal revenue,
            BigDecimal purchaseCost,
            BigDecimal expense,
            BigDecimal profit,
            BigDecimal marginRate,
            int salesCount,
            int purchaseCount,
            int expenseCount
    ) {}

    public record ProjectProfitSummary(
            LocalDate from,
            LocalDate to,
            BigDecimal totalRevenue,
            BigDecimal totalCost,
            BigDecimal totalProfit,
            /** 프로젝트가 지정되지 않은 전표 금액 (매출/원가/비용 순) */
            BigDecimal unassignedRevenue,
            BigDecimal unassignedCost,
            List<ProjectProfitRow> rows
    ) {}
}
