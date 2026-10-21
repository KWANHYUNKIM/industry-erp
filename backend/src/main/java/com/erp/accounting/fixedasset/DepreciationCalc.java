package com.erp.accounting.fixedasset;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 감가상각계산 한 묶음(원본 E010616) — 회계기수 · 감가상각기간. 전체계산이 상각 행(depreciations)을 만들면서 대장에 바로 반영하고,
 * [반영내용삭제]는 그 행만 지운다(건수 · 총액은 남는다).
 */
@Entity
@Table(name = "depreciation_calcs")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DepreciationCalc extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Integer fiscalTerm;

    /** yyyy-MM */
    @Column(nullable = false, length = 7)
    private String periodFrom;

    @Column(nullable = false, length = 7)
    private String periodTo;

    /** 고정자산대장에 반영됨 */
    @Column(nullable = false)
    private boolean reflected;

    @Column(nullable = false)
    private Integer itemCount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal totalAmount;

    /** 기간 개월수 − 상각월수 의 합(원본 고정자산전표 적요 '제외월수 : 9') */
    @Column(nullable = false)
    private Integer excludedMonths;

    @Column(length = 50)
    private String createdBy;
}
