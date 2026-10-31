package com.erp.accounting.cost.project;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 프로젝트계획의 항목 계획 줄 — 원본 '<이름> [<코드>] 판매 계획 리스트' 의 한 줄(2026-10-14 E040636 실측).
 * 항목(01 판매 · 02 구매 · 03 노무비 · 04 경비)마다 여러 줄을 둔다. [금액] 과 달별 금액은 따로 저장된다 —
 * 목록 [판매] · 계획 리스트 [예상수익금액] 은 [금액], 실적현황 예상금액은 달별 금액이다.
 */
@Entity
@Table(name = "project_plan_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProjectPlanLine extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private ProjectPlan plan;

    /** '01' 판매 · '02' 구매 · '03' 노무비 · '04' 경비. */
    @Column(name = "item_code", nullable = false, length = 2)
    private String itemCode;

    @Column(length = 300)
    private String remark;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    @OneToMany(mappedBy = "line", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("ym asc")
    @Builder.Default
    private List<ProjectPlanLineMonth> months = new ArrayList<>();
}
