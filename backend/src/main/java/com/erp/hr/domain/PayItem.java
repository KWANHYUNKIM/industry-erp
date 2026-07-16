package com.erp.hr.domain;

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
}
