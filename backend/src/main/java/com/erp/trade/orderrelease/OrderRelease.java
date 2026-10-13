package com.erp.trade.orderrelease;

import com.erp.common.BaseTimeEntity;
import com.erp.trade.sales.Sales;
import com.erp.trade.salesorder.SalesOrder;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 주문서출고처리 한 건(원본 E040230 의 '처리' 탭 한 줄).
 *
 * <p>미처리 탭에서 주문 줄을 고르고 [출고] → '출고등록' 창 [저장(F8)] 하면 생긴다. 재고 · 회계는 움직이지 않는다 —
 * 그 일은 처리 탭 [판매] '입력' 으로 만든 판매 전표가 한다. 만든 판매는 {@link #sale} 에 걸린다
 * (판매를 지우면 비어 '입력' 으로 돌아간다 — FK ON DELETE SET NULL).
 */
@Entity
@Table(name = "order_releases")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderRelease extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "release_no", nullable = false, unique = true, length = 30)
    private String releaseNo;

    @Column(name = "release_date", nullable = false)
    private LocalDate releaseDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sales_order_id", nullable = false)
    private SalesOrder salesOrder;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id")
    private Sales sale;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Builder.Default
    @OneToMany(mappedBy = "release", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderReleaseLine> lines = new ArrayList<>();
}
