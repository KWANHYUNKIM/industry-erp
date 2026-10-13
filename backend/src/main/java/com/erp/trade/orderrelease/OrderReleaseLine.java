package com.erp.trade.orderrelease;

import com.erp.trade.salesorder.SalesOrderLine;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 출고처리한 주문 줄과 그 수량. 품목 · 단가는 주문 줄 것을 쓴다. */
@Entity
@Table(name = "order_release_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderReleaseLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_release_id", nullable = false)
    private OrderRelease release;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sales_order_line_id", nullable = false)
    private SalesOrderLine salesOrderLine;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;
}
