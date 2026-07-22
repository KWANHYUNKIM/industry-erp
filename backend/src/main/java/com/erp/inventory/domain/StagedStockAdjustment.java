package com.erp.inventory.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.enums.StagedStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 단계별재고조정. 실사수량을 요청으로 올려 승인(반영)/반려 단계를 거친다.
 * 반영 시 일반 재고조정(StockAdjustment, ADJUST)을 생성해 실제 재고에 반영한다.
 */
@Entity
@Table(name = "staged_stock_adjustments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StagedStockAdjustment extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "adjust_no", nullable = false, unique = true, length = 30)
    private String adjustNo;

    @Column(name = "request_date", nullable = false)
    private LocalDate requestDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    /** 요청 시점의 장부수량 스냅샷 */
    @Column(name = "book_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal bookQty = BigDecimal.ZERO;

    @Column(name = "actual_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal actualQty = BigDecimal.ZERO;

    @Column(length = 300)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private StagedStatus status = StagedStatus.REQUESTED;

    @Column(length = 50)
    private String requester;

    @Column(length = 50)
    private String handler;
}
