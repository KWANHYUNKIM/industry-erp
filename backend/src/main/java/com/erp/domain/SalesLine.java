package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 판매 전표 명세(품목 단위 라인).
 */
@Entity
@Table(name = "sales_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SalesLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sales_id", nullable = false)
    private Sales sales;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    /** 공급가액 = 수량 x 단가 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    /** 부가세 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;

    /** 라인별 적요(선택). 이카운트 판매입력 그리드의 "적요" 컬럼. */
    @Column(length = 255)
    private String remark;
}
