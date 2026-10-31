package com.erp.accounting.cost.expensecontrol;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 통제유형(원본 E060808 통제유형등록, 2026-10-20 실측). 비용 · 비용그룹이 이것을 골라 한도 · 사용인원 통제를 받는다.
 * 이름은 비용에 복사하지 않는다 — 원본도 통제유형 이름을 고치면 비용리스트 [통제유형명] 이 바로 새 이름이다.
 */
@Entity
@Table(name = "expense_control_types")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExpenseControlType extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "period_type", nullable = false, length = 20)
    private ExpensePeriodType periodType;

    /** [인원통제] 사용 · 사용안함 */
    @Column(name = "person_control", nullable = false)
    private boolean personControl;

    @Enumerated(EnumType.STRING)
    @Column(name = "limit_type", nullable = false, length = 20)
    private ExpenseLimitType limitType;

    @Enumerated(EnumType.STRING)
    @Column(name = "notice_type", nullable = false, length = 20)
    private ExpenseNoticeType noticeType;

    @Column(length = 500)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
