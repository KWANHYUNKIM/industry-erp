package com.erp.accounting.cost.cost;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 원본 이익관리 &gt; 원가생성/수정(E040802)의 한 줄 — 원가를 잡는 기간.
 *
 * <p>2026-10-12 loginaa 실측: [신규] 기본등록에서 시작월(앞 기간 다음 달로 잠김) · 종료월 · 원가계산법 · 외주비기준을
 * 정해 저장하면 맨 위에 한 줄이 생기고, 그 줄에서 사전작업 → 원가계산(생성) → 원가현황을 차례로 한다.
 * 기간은 한 달일 수도 여러 달일 수도 있다(원본 자료에 2026/07 ~ 2026/08 이 있다).
 */
@Entity
@Table(name = "cost_periods")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CostPeriod extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** yyyy-MM */
    @Column(name = "start_month", nullable = false, unique = true, length = 7)
    private String startMonth;

    /** yyyy-MM */
    @Column(name = "end_month", nullable = false, length = 7)
    private String endMonth;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CostMethod method;

    @Enumerated(EnumType.STRING)
    @Column(name = "outsourcing_basis", nullable = false, length = 20)
    private OutsourcingBasis outsourcingBasis;

    /** 원가계산 [생성] 을 했나 — 하고 나면 원본 [원가계산] 칸에 수정 · 기말금액재계산이 붙는다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean generated = false;
}
