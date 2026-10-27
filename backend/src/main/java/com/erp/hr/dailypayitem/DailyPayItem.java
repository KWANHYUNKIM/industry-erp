package com.erp.hr.dailypayitem;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 일용근로 수당 · 공제 항목(원본 E020136 '일용근로 수당리스트' · E020137 '일용근로 공제리스트').
 * builtin 은 급여계산이 셈하는 기본 항목(02 일근무 · 01 소득세 · 02 지방소득세)이라 지우지 못한다.
 */
@Entity
@Table(name = "daily_pay_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyPayItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DailyPayItemKind kind;

    @Column(nullable = false, length = 10)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** 원본 [지급유형] 글자 그대로(변동(일) …). 공제는 없음. */
    @Column(name = "pay_method", length = 20)
    private String payMethod;

    @Column(precision = 9, scale = 4)
    private BigDecimal rate;

    /** 원본 [과세구분] 글자 그대로(전액과세 …). 공제는 없음. */
    @Column(name = "tax_type", length = 20)
    private String taxType;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(nullable = false)
    @Builder.Default
    private boolean builtin = false;

    /** 원본 계산식 칸 — 이름으로 자동으로 만든다(2026-10-20 실측, 이름을 바꾸면 따라 바뀜). */
    public String formula() {
        if (kind == DailyPayItemKind.DEDUCTION) return "R( " + name + "(급여지급사항) , 0 )";
        // 원본 2026-10-21: 고정 'R( 이름(급여지급사항) , 0 )', 변동(일) · 변동(시간) · 변동(지급률) 'R( 이름(급여지급사항) * 이름(근무기록확정) , 0 )',
        // 변동(직접입력) '근무기록확정(금액)'. [설정] 을 누르면 저장되며 채워진다(우리는 저장할 때).
        if ("고정".equals(payMethod)) return "R( " + name + "(급여지급사항) , 0 )";
        if ("변동(직접입력)".equals(payMethod)) return "근무기록확정(금액)";
        if (payMethod == null || payMethod.startsWith("변동")) return "R( " + name + "(급여지급사항) * " + name + "(근무기록확정) , 0 )";
        return null;
    }
}
