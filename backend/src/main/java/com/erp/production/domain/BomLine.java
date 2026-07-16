package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.domain.Item;

/**
 * BOM 구성 자재(제품 1단위당 소요량).
 */
@Entity
@Table(name = "bom_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BomLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bom_id", nullable = false)
    private Bom bom;

    /** 구성 자재(원자재/부자재/반제품) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "component_id", nullable = false)
    private Item component;

    /** 제품 1단위 생산에 필요한 소요량 */
    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity;
}
