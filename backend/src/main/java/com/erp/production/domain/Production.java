package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Warehouse;

/**
 * 생산실적. 작업지시에 대한 실제 생산 등록.
 * 저장 시 BOM 소요량만큼 자재 출고 + 완제품 입고.
 */
@Entity
@Table(name = "productions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Production extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 생산번호 (예: PR-20260706-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String prodNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "work_order_id", nullable = false)
    private WorkOrder workOrder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Item product;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    /** 생산수량(완제품 입고량) */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal producedQty;

    @Column(nullable = false)
    private LocalDate productionDate;

    @Column(length = 50)
    private String createdBy;

    /** 소요된 자재 내역 */
    @OneToMany(mappedBy = "production", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ProductionMaterial> materials = new ArrayList<>();

    public void addMaterial(ProductionMaterial m) {
        m.setProduction(this);
        this.materials.add(m);
    }
}
