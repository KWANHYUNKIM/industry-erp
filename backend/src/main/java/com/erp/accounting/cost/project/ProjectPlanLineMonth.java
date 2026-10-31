package com.erp.accounting.cost.project;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 항목 계획 줄의 달 하나 — 원본 계획 입력 창의 '2026년 10월' 칸(2026-10-14 E040636 실측). */
@Entity
@Table(name = "project_plan_line_months")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProjectPlanLineMonth {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "line_id", nullable = false)
    private ProjectPlanLine line;

    /** YYYY-MM */
    @Column(nullable = false, length = 7)
    private String ym;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;
}
