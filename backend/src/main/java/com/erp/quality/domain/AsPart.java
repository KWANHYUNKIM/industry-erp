package com.erp.quality.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Warehouse;

/**
 * A/S 수리에 소모된 부품. 부품 등록 시 창고 재고를 차감(OUTBOUND)한다.
 * A/S소모현황(E040641)의 소스 — 어떤 A/S에 어떤 부품이 얼마나 나갔는지 추적한다.
 */
@Entity
@Table(name = "as_parts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AsPart extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "as_request_id", nullable = false)
    private AsRequest asRequest;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    /** 부품 단가(선택). 소모금액 = 수량 × 단가. */
    @Column(name = "unit_price", precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
