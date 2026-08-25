package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.domain.Item;

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
     * 시리얼/로트 번호(선택). 이카운트 판매입력 그리드의 `serial_cd` 컬럼.
     * 로트 마스터(inventory.Lot)와 FK로 묶지 않는다 — 로트 관리를 켜지 않은 품목도
     * 출하 시 제조번호를 적어 두는 용도로 쓰기 때문이다.
     */
    @Column(name = "lot_no", length = 60)
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
}
