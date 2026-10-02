package com.erp.production.production;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.item.Item;

/**
 * 생산실적에서 소요(출고)된 자재 내역.
 */
@Entity
@Table(name = "production_materials")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProductionMaterial {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "production_id", nullable = false)
    private Production production;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "component_id", nullable = false)
    private Item component;

    /** 소요량(= BOM 소요량 x 생산수량) */
    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity;

    /** 원본 [소모] 탭의 [적요]. */
    @Column(length = 255)
    private String note;

    /** 원본 [소모] 탭의 [시리얼/로트No.]. */
    @Column(name = "lot_no", length = 60)
    private String lotNo;
}
