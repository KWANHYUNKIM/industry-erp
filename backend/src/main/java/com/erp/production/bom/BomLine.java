package com.erp.production.bom;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.item.Item;

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

    /** 제품 1단위 생산에 필요한 소요량 = 입력 수량 ÷ 생산수량. 생산 · 불출 · 원가 · MRP 가 이 값을 쓴다. */
    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity;

    /** 원본 BOM등록 격자 [수량] — 머리 [생산수량] 개를 만드는 데 드는 양(사람이 넣은 그대로, V427). */
    @Column(name = "input_qty", nullable = false, precision = 18, scale = 4)
    private BigDecimal inputQty;

    /** 원본 격자 [생산공정] · [위치] · [적요]. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "process_id")
    private com.erp.production.process.ProductionProcess process;

    @Column(length = 100)
    private String location;

    @Column(length = 200)
    private String remark;
}
