package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.domain.Item;

/**
 * 구매 전표 명세(품목 단위 라인).
 */
@Entity
@Table(name = "purchase_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PurchaseLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "purchase_id", nullable = false)
    private Purchase purchase;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;

    /** 라인별 적요(선택). 이카운트 구매입력 그리드의 "적요" 컬럼. */
    @Column(length = 255)
    private String remark;

    /** 시리얼/로트 번호(선택). 이카운트 구매입력 그리드의 `serial_cd` 컬럼. */
    @Column(name = "lot_no", length = 60)
    private String lotNo;

    /** 부대비용(선택). 이카운트의 `cust_amt`. 합계 금액에는 더하지 않는다. */
    @Column(name = "extra_cost", precision = 18, scale = 2)
    private BigDecimal extraCost;

    /**
     * 불러온 근거전표(발주서). 이카운트 구매입력 그리드의 <b>불러온 전표 / 전표일자 / 전표No.</b> 3열.
     * [전표불러오기]로 발주 라인을 담았을 때만 채워진다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_order_id")
    private PurchaseOrder sourceOrder;
}
