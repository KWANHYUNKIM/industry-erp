package com.erp.trade.purchase;

import com.erp.trade.purchaseorder.PurchaseOrder;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.item.Item;

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

    /**
     * 줄 품목명. 원본의 줄 품목명은 <b>입력 시점의 이름</b>이다 — 품목 이름을 나중에 고쳐도 지난 전표는 그때 이름 그대로
     * (0005 구매 줄: 원본 '포장김치1kg', 품목은 지금 '포장김치'). 저장 때 품목 이름으로 채운다. 비어 있으면(null) 품목 이름으로 본다.
     */
    @Column(name = "item_name", length = 200)
    private String itemName;

    /** 화면 · 출력물에 보일 품목명 — 줄에 저장된 값, 저장 전 옛 줄(null)이면 품목 이름. */
    public String effectiveItemName() {
        return itemName != null ? itemName : (getItem() == null ? null : getItem().getName());
    }

    /**
     * 줄 규격. 원본은 전표 줄의 [규격] 을 줄마다 따로 저장한다 — 품목을 고르면 품목 규격으로 채워지지만
     * 줄에서 고치거나 비울 수 있고, 저장된 값이 그대로 보인다(2026-10-28 loginaa: 같은 D001 이 견적 11/15-2 는 '[대형]', 11/20-1 은 빈칸).
     * 비어 있으면(null) 품목 규격으로 본다. 빈 글자("")는 일부러 비운 것이다.
     */
    @Column(name = "spec", length = 200)
    private String spec;

    /** 화면에 보일 규격 — 줄에 저장된 값, 저장 전 옛 줄(null)이면 품목 규격. */
    public String effectiveSpec() {
        return spec != null ? spec : (getItem() == null ? null : getItem().getSpec());
    }

    /** 시리얼/로트 번호(선택). 이카운트 구매입력 그리드의 `serial_cd` 컬럼. */
    @Column(name = "lot_no", length = 500)
    private String lotNo;

    /** 부대비용(선택). 이카운트의 `cust_amt`. 합계 금액에는 더하지 않는다. */
    @Column(name = "extra_cost", precision = 18, scale = 2)
    private BigDecimal extraCost;

    /** 외자 줄의 외화단가. 내자 줄은 null. */
    @Column(name = "foreign_price", precision = 18, scale = 4)
    private BigDecimal foreignPrice;

    /** 외자 줄의 외화금액. 원화 공급가액 = round(외화금액 × 환율). */
    @Column(name = "foreign_amount", precision = 18, scale = 2)
    private BigDecimal foreignAmount;

    /** 이 줄에 적용한 환율(머리 환율과 다를 수 있다). */
    @Column(name = "line_rate", precision = 18, scale = 4)
    private BigDecimal lineRate;

    /**
     * 불러온 근거전표(발주서). 이카운트 구매입력 그리드의 <b>불러온 전표 / 전표일자 / 전표No.</b> 3열.
     * [전표불러오기]로 발주 라인을 담았을 때만 채워진다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_order_id")
    private PurchaseOrder sourceOrder;
}
