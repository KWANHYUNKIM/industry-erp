package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 입출고 이력(원장). 추가 전용 — 재고 변동의 감사 추적 역할.
 */
@Entity
@Table(name = "stock_transactions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StockTransaction extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StockTransactionType type;

    /** 실제 변동 수량(부호 있음). 입고 +, 출고 -, 조정 +/-. */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantityChange;

    /** 변동 직후의 잔량(스냅샷) */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal balanceAfter;

    /** 단가(입고 등에서 사용, 선택) */
    @Column(precision = 18, scale = 2)
    private BigDecimal unitPrice;

    /** 거래 일자 */
    @Column(nullable = false)
    private LocalDate transactionDate;

    /** 비고 */
    @Column(length = 500)
    private String note;

    /** 처리자(로그인 사용자명) */
    @Column(length = 50)
    private String createdBy;
}
