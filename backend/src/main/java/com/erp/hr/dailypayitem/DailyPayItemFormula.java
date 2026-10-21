package com.erp.hr.dailypayitem;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 일용근로 수당 · 공제 계산식리스트 한 줄(원본 E020136 [설정] → '계산식리스트', 2026-10-21 실측).
 * 적용시점(yyyy-MM)부터 이 계산식으로 셈한다. 기본 '2010/01 ~' 줄(자동 계산식)은 행이 없다 — {@link DailyPayItem#formula()}.
 */
@Entity
@Table(name = "daily_pay_item_formulas")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyPayItemFormula extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private DailyPayItem item;

    /** 적용시점 yyyy-MM. */
    @Column(name = "apply_month", nullable = false, length = 7)
    private String applyMonth;

    @Column(nullable = false, length = 500)
    private String formula;
}
