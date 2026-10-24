package com.erp.hr.payroll;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

/**
 * 수당·공제 항목 마스터 (이카운트 '수당/공제그룹'의 항목).
 *
 * taxable 이 핵심이다. 식대처럼 비과세인 수당은 4대보험·소득세 계산 기준(과세소득)에서 빠진다.
 * 공제 항목은 taxable 을 쓰지 않는다.
 */
@Entity
@Table(name = "pay_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 항목코드 (예: MEAL, OVERTIME) */
    @Column(nullable = false, unique = true, length = 30)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PayslipLineKind kind;

    /** 과세 대상인가 (수당에서만 의미가 있다. 비과세면 4대보험·소득세 기준에서 빠진다) */
    @Column(nullable = false)
    @Builder.Default
    private boolean taxable = true;

    /** 그룹에서 금액을 지정하지 않으면 쓰는 기본금액 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal defaultAmount = BigDecimal.ZERO;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /** 원본 [표시순서]. 수당리스트·급여대장의 열 차례. */
    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    /** 원본 [배율] (예: 야근 1.5). 비우면 없음. */
    @Column(precision = 9, scale = 4)
    private BigDecimal rate;

    /** 원본 [비과세유형]. 전액과세가 아니면 taxable=false 로 함께 맞춘다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "tax_free_type", nullable = false, length = 20)
    @Builder.Default
    private PayTaxFreeType taxFreeType = PayTaxFreeType.NONE;

    /** 원본 [지급유형]. */
    @Enumerated(EnumType.STRING)
    @Column(name = "pay_method", nullable = false, length = 20)
    @Builder.Default
    private PayMethod payMethod = PayMethod.FIXED;

    /** 원본 [산출방법] — 사람이 읽는 설명(예: 통상시급 * 야간근로시간수 * 1.5). */
    @Column(name = "calc_note", length = 200)
    private String calcNote;
}
