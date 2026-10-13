package com.erp.trade.price;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.warehouse.Warehouse;
import jakarta.persistence.*;
import lombok.*;

/** [창고설정] 구분(영업 · 구매) · 창고 — 창고 하나에 구분마다 그룹 하나(단가적용순서 '창고별특별단가'). */
@Entity
@Table(name = "special_price_group_warehouses")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SpecialPriceGroupWarehouse extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private SpecialPriceGroup group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Enumerated(EnumType.STRING)
    @Column(name = "trade_type", nullable = false, length = 20)
    private SpecialPriceType tradeType;
}
