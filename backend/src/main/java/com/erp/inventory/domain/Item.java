package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

/**
 * 품목 마스터. (이카운트의 '품목등록'에 대응)
 */
@Entity
@Table(name = "items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Item extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 품목코드 (예: ITM-0001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 품명 */
    @Column(nullable = false, length = 200)
    private String name;

    /** 규격 (예: 100x200mm) */
    @Column(length = 200)
    private String spec;

    /** 단위 (예: EA, KG, BOX) */
    @Column(nullable = false, length = 20)
    private String unit;

    /** 품목분류 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ItemCategory category;

    /** 사용자 정의 품목그룹. 미지정 허용. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_group_id")
    private ItemGroup itemGroup;

    /** 표준 단가 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    /** 안전재고 (이 수량 미만이면 경고) */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal safetyStock = BigDecimal.ZERO;

    /** 바코드 */
    @Column(length = 100)
    private String barcode;

    /** 사용 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
