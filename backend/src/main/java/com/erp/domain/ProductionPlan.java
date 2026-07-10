package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 생산계획(MPS). 제품별 주차 수요 대비 생산 계획수량.
 * 확정 시 작업지시(WorkOrder)로 전환 가능.
 */
@Entity
@Table(name = "production_plans")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProductionPlan extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Item product;

    /** 계획 주차 (예: 2026-W28) */
    @Column(nullable = false, length = 20)
    private String planWeek;

    /** 수요량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal demandQty = BigDecimal.ZERO;

    /** 계획 생산량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planQty = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ProductionPlanStatus status = ProductionPlanStatus.REVIEW;

    /** 이 계획에서 생성된 작업지시 (지시완료 시). 미지시 상태면 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "work_order_id")
    private WorkOrder workOrder;

    @Column(length = 300)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
