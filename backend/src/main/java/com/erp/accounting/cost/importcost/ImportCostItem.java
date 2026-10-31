package com.erp.accounting.cost.importcost;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 비용항목(원본 E060210 비용항목등록). 수입관리대장의 비용 열이 정렬순서대로 이 목록에서 생긴다.
 * 기본 여섯(10 비용항목 직접설정가능 · 12 관세 · 13 보험료 · 14 관세사수수료 · 15 하역비 · 16 운반비)은 마이그레이션이 심는다.
 */
@Entity
@Table(name = "import_cost_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ImportCostItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
