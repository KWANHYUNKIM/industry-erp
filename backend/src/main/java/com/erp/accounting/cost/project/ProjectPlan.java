package com.erp.accounting.cost.project;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.project.Project;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 프로젝트계획(E040636) — 원본 계획 머리: 프로젝트 · 시작일 · 완료일 · 적요(2026-10-14 실측).
 * 항목(01 판매 · 02 구매 · 03 노무비 · 04 경비) 금액은 계획 줄({@link ProjectPlanLine})에 있고,
 * 아래 plan* 네 칸은 그 줄 [금액] 의 합을 서버가 다시 적어 두는 자리다(목록 · 달성률이 읽는다).
 * 실적은 저장하지 않고 판매·구매·비용 전표 집계(ProjectProfitService)로 대조한다.
 */
@Entity
@Table(name = "project_plans")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProjectPlan extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    /** 시작일의 해 — 서버가 시작일에서 채운다(예전 연 단위 계획의 자리). */
    @Column(name = "plan_year", nullable = false)
    private int planYear;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "plan_revenue", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planRevenue = BigDecimal.ZERO;

    @Column(name = "plan_cost", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planCost = BigDecimal.ZERO;

    /*
     * 원본 프로젝트계획조회(E040636) 격자의 <b>[구매]·[노무비]·[경비]</b>(2026-09-01 실측).
     * 원본은 계획을 판매·구매·노무비·경비 네 갈래로 적는다. 우리는 planRevenue(판매)와
     * planCost(원가 합계) 둘뿐이라 <b>갈라 적을 데가 아예 없었다.</b> planCost 는 합계
     * 그대로 둔다 — 달성률 계산이 그 값을 쓰고 있어 뜻을 바꾸면 지난 계획의 달성률이 달라진다.
     */
    @Column(name = "plan_purchase", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planPurchase = BigDecimal.ZERO;

    @Column(name = "plan_labor", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planLabor = BigDecimal.ZERO;

    @Column(name = "plan_expense", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planExpense = BigDecimal.ZERO;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
