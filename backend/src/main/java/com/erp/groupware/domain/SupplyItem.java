package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

/**
 * 공용품(사무 공용 비품) 마스터. (그룹웨어 &gt; 공용품관리)
 */
@Entity
@Table(name = "supply_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SupplyItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 품목코드 (예: SP-001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 공용품명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 분류 (사무용품/소모품/비품 등) */
    @Column(length = 50)
    private String category;

    /** 단위 (개/박스 등) */
    @Column(length = 20)
    private String unit;

    /** 재고수량 */
    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal stockQty = BigDecimal.ZERO;

    /** 비고 */
    @Column(length = 300)
    private String note;
}
