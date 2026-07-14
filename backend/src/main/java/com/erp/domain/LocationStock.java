package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 로케이션별 재고 배치. 창고 단위 재고(Stock)가 진실이고, 이것은 그 재고를
 * 창고 안 어디에 두었는지 쪼갠 것이다. 배치 합계는 창고 재고를 넘을 수 없다.
 */
@Entity
@Table(name = "location_stocks")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class LocationStock extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "location_id")
    private WarehouseLocation location;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal quantity = BigDecimal.ZERO;
}
