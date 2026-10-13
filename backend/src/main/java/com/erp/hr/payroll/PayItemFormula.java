package com.erp.hr.payroll;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 원본 수당항목등록(E090103) <b>[계산식]</b> — 항목마다 적용시점별로 두는 계산식(계산식리스트 · 계산식등록).
 *
 * <p>2026-10-13 loginaa 실측: 부양가족수당 계산식리스트 = 2019/01 ~ · 2018/01 ~ 두 줄,
 * 식은 {@code R( ( 기본급(급여지급사항) * 0.01 * 간이세액표 적용 부양가족수(계산항목) ) )} — 기본급 3,800,000 · 본인 1명 → 38,000,
 * 배우자 · 가족 1명을 더하면 114,000. 급여계산은 귀속월에 걸리는 가장 늦은 적용시점의 식을 푼다({@link PayFormula}).
 */
@Entity
@Table(name = "pay_item_formulas")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayItemFormula extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pay_item_id", nullable = false)
    private PayItem payItem;

    /** 적용시점 YYYY-MM — 이 달부터 다음 적용시점 전까지 */
    @Column(name = "effective_from", nullable = false, length = 7)
    private String effectiveFrom;

    @Column(nullable = false, length = 2000)
    private String formula;

    /** 사용중단이면 false — 급여계산이 건너뛴다 */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
