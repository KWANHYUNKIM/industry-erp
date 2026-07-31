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

    /**
     * 의료기기 표준코드(UDI-DI). 값이 있으면 의료기기공급내역보고(E040231) 대상 품목으로 본다.
     * 별도 플래그를 두지 않는 이유: 보고에 필요한 것이 이 코드 자체라, 코드가 없으면 어차피 보고할 수 없다.
     */
    @Column(name = "udi_di", length = 50)
    private String udiDi;

    /** 사용 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
