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


    /**
     * 생산된공장 — 자재를 <b>소모한</b> 곳. 원본 생산입고조회의 [생산된공장명] 이다.
     *
     * <p>생산불출(창고 → 공장)과 짝이다. 자재는 공장에서 빠지고 완제품은 받는창고로 들어간다.
     * 비워 두면 예전처럼 받는창고에서 자재도 빠진다 — 공장을 안 쓰는 회사도 있다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_warehouse_id")
    private Warehouse fromWarehouse;
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

    /**
     * 적요 — 원본 생산입고현황의 마지막 열이고 생산입고 III 그리드의 마지막 열이다.
     * 판매·구매·생산불출 전표는 이미 다 들고 있는데 생산입고에만 없었다.
     */
    @Column(length = 255)
    private String note;

    /** 소요된 자재 내역 */
    @OneToMany(mappedBy = "production", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ProductionMaterial> materials = new ArrayList<>();

    public void addMaterial(ProductionMaterial m) {
        m.setProduction(this);
        this.materials.add(m);
    }
}
