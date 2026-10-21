package com.erp.inventory.adjustment;

import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.common.BaseTimeEntity;
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

    /**
     * 실사 전표 번호 — 원본 단계별재고실사는 한 장(일자 · 창고)에 여러 줄을 담는다. 줄마다 이 번호를 같이 쓴다.
     * 원본 [입력일자] '2026/10/20 -1' 의 끝 번호가 이 번호의 끝이다.
     */
    @Column(name = "slip_no", nullable = false, length = 30)
    private String slipNo;

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

    /** 이 줄로 맞춘 재고조정 — 실사 전표의 [재고조정] 체크 · 재고조정진행단계 [재고조정]. 조정을 지우면 DB 가 비운다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "adjustment_id")
    private StockAdjustment adjustment;
}
