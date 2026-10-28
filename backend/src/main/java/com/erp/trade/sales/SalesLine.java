package com.erp.trade.sales;

import com.erp.trade.salesorder.SalesOrder;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.item.Item;

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

    /**
     * 시리얼/로트 번호(선택). 이카운트 판매입력 그리드의 `serial_cd` 컬럼.
     * 로트 마스터(inventory.Lot)와 FK로 묶지 않는다 — 로트 관리를 켜지 않은 품목도
     * 출하 시 제조번호를 적어 두는 용도로 쓰기 때문이다.
     */
    @Column(name = "lot_no", length = 500)
    private String lotNo;

    /**
     * 부대비용(선택). 이카운트의 `cust_amt` — 운임·검사비처럼 그 라인에 붙는 비용이다.
     * 합계 금액에는 더하지 않는다(원본도 공급가액/부가세와 별도 열로 집계한다).
     */
    @Column(name = "extra_cost", precision = 18, scale = 2)
    private BigDecimal extraCost;

    /**
     * 불러온 근거전표(수주). 이카운트 판매입력 그리드의 <b>불러온 전표 / 전표일자 / 전표No.</b> 3열이
     * 가리키는 대상이다. [전표불러오기]로 수주 라인을 담았을 때만 채워지고, 직접 입력한 줄은 비어 있다.
     *
     * <p>적요에 "SO-... 불러옴" 이라고 적어 두던 것을 대체한다 — 문자열은 검색·집계가 안 되고
     * 수주가 지워져도 남아 실제와 어긋난다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_order_id")
    private SalesOrder sourceOrder;

    /**
     * 이 줄이 회계전표로 반영됐는지. 원본 판매일괄회계반영 [일부반영] 창은 품목 줄마다 골라 반영한다
     * (2026-10-22 재기: 3줄 중 2번째 줄만 반영하면 그 줄만 목록에서 빠진다). 판매의 모든 줄이 반영되면 판매의 accountingReflected 도 켜진다.
     */
    @Builder.Default
    @Column(name = "accounting_reflected", nullable = false)
    private boolean accountingReflected = false;
}
