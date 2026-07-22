package com.erp.accounting.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Project;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 프로젝트계획. 프로젝트별 연간 계획 매출·원가를 담는다.
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

    @Column(name = "plan_year", nullable = false)
    private int planYear;

    @Column(name = "plan_revenue", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planRevenue = BigDecimal.ZERO;

    @Column(name = "plan_cost", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planCost = BigDecimal.ZERO;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
