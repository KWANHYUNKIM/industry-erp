package com.erp.accounting.project.dto;

import com.erp.accounting.project.ProjectPlan;
import com.erp.accounting.project.ProjectPlanLine;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ProjectPlanDtos {

    private ProjectPlanDtos() {}

    /**
     * 원본 [프로젝트 계획항목 등록] 창의 판(2026-10-14 E040636 실측): 프로젝트(필수) · 시작일(기본 오늘) ·
     * 완료일(기본 그해 12/31) · 적요. 항목 금액은 여기서 받지 않는다 — 항목마다 [등록] 의 계획 줄로 넣는다.
     */
    public record CreateProjectPlanRequest(
            @NotNull(message = "프로젝트를 선택하세요.") Long projectId,
            @NotNull(message = "시작일을 입력하세요.") LocalDate startDate,
            @NotNull(message = "완료일을 입력하세요.") LocalDate endDate,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record ProjectPlanResponse(
            Long id, Long projectId, String projectCode, String projectName,
            LocalDate startDate, LocalDate endDate, String remark,
            /** 항목 계획 줄 [금액] 의 합 — 01 판매 · 02 구매 · 03 노무비 · 04 경비. */
            BigDecimal planRevenue, BigDecimal planPurchase, BigDecimal planLabor, BigDecimal planExpense,
            String createdBy
    ) {
        public static ProjectPlanResponse from(ProjectPlan p) {
            return new ProjectPlanResponse(
                    p.getId(), p.getProject().getId(), p.getProject().getCode(), p.getProject().getName(),
                    p.getStartDate(), p.getEndDate(), p.getRemark(),
                    p.getPlanRevenue(), p.getPlanPurchase(), p.getPlanLabor(), p.getPlanExpense(),
                    p.getCreatedBy());
        }
    }

    /** 계획 입력 창의 달 칸 하나 — ym 은 YYYY-MM. */
    public record MonthAmount(
            @NotNull @Pattern(regexp = "\\d{4}-\\d{2}", message = "달은 YYYY-MM 으로 보내세요.") String ym,
            @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount
    ) {}

    /** 원본 '… 계획 입력' 창(알약 '내역'): 적요 · 금액 + 계획 기간의 달마다 칸. */
    public record ProjectPlanLineRequest(
            @NotNull @Pattern(regexp = "0[1-4]", message = "항목코드를 확인하세요.") String itemCode,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String remark,
            @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") BigDecimal amount,
            @Valid List<MonthAmount> months
    ) {}

    public record ProjectPlanLineResponse(
            Long id, Long planId, String itemCode, String remark, BigDecimal amount, List<MonthAmount> months
    ) {
        public static ProjectPlanLineResponse from(ProjectPlanLine l) {
            return new ProjectPlanLineResponse(l.getId(), l.getPlan().getId(), l.getItemCode(), l.getRemark(), l.getAmount(),
                    l.getMonths().stream().map(m -> new MonthAmount(m.getYm(), m.getAmount())).toList());
        }
    }

    /** 프로젝트계획 리스트(E040636) 한 줄: 계획 vs 실적(전표 집계)과 달성률. */
    public record ComparisonRow(
            Long id, int planYear,
            Long projectId, String projectCode, String projectName,
            BigDecimal planRevenue, BigDecimal planCost, BigDecimal planProfit,
            BigDecimal actualRevenue, BigDecimal actualCost, BigDecimal actualProfit,
            BigDecimal revenueAchieveRate, BigDecimal profitAchieveRate,
            BigDecimal planPurchase, BigDecimal planLabor, BigDecimal planExpense,
            /* 원본 목록 [시작일] · [종료일] 은 계획의 시작일 · 완료일이다(프로젝트 마스터 날짜가 아니다 — 2026-10-14 실측). */
            LocalDate startDate, LocalDate endDate, String remark,
            java.time.LocalDateTime updatedAt
    ) {}

    /**
     * 프로젝트계획/실적현황(E040637) 한 칸 — 프로젝트 · 항목(판매 · 구매 · 노무비 · 경비) · 달 하나의 예상과 실적.
     * 달마다 한 줄이라 화면이 [기간구분](월별 · 분기별 · 반기별 · 연별 · 집계)으로 다시 묶는다.
     */
    public record StatusCell(
            Long projectId, String projectCode, String projectName,
            LocalDate startDate, LocalDate endDate,
            String item, String month,
            BigDecimal plan, BigDecimal actual
    ) {}
}
