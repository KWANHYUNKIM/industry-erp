package com.erp.trade.domain;

import com.erp.trade.domain.enums.MallOrderStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;

/**
 * 쇼핑몰 주문. 외부몰에서 수집한 원본 주문이며, 확인 후 판매전표로 전환한다.
 * 재고 차감·채권 계상은 판매전표가 한다 — 쇼핑몰이 재고를 직접 건드리면 진실이 둘이 된다.
 */
@Entity
@Table(name = "mall_orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MallOrder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 몰 이름 (스마트스토어·쿠팡·자사몰 등) */
    @Column(nullable = false, length = 50)
    private String mall;

    /** 몰이 부여한 주문번호. 몰 안에서 유일하다. */
    @Column(name = "mall_order_no", nullable = false, length = 50)
    private String mallOrderNo;

    @Column(name = "order_date", nullable = false)
    private LocalDate orderDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private MallOrderStatus status = MallOrderStatus.RECEIVED;

    @Column(name = "buyer_name", nullable = false, length = 100)
    private String buyerName;

    @Column(name = "buyer_phone", length = 30)
    private String buyerPhone;

    @Column(length = 300)
    private String address;

    /** 몰이 보내준 상품명 원문. 우리 품목과 매핑되기 전에도 무엇을 주문했는지는 알아야 한다. */
    @Column(name = "product_name", nullable = false, length = 200)
    private String productName;

    /** 우리 품목. 매핑되지 않으면 판매전환할 수 없다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_id")
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "total_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    /** 전환 시 생성된 판매전표 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_id")
    private Sales sales;

    @Column(length = 500)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
