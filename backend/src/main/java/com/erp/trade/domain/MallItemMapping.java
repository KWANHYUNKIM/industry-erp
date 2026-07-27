package com.erp.trade.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import jakarta.persistence.*;
import lombok.*;

/**
 * 쇼핑몰 품목코드연결(E041004). (쇼핑몰, 쇼핑몰품목코드) → 우리 품목 매핑.
 * 주문 수집 시 품목이 지정되지 않았어도 이 매핑으로 자동 연결한다(수동 mapItem 을 대체·보완).
 */
@Entity
@Table(name = "mall_item_mappings",
        uniqueConstraints = @UniqueConstraint(name = "uk_mall_item_mappings", columnNames = {"mall", "mall_product_code"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MallItemMapping extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 쇼핑몰 이름 */
    @Column(nullable = false, length = 50)
    private String mall;

    /** 쇼핑몰 품목코드(몰 상품 key) */
    @Column(name = "mall_product_code", nullable = false, length = 100)
    private String mallProductCode;

    /** 몰 상품명(참고 표시용) */
    @Column(name = "mall_product_name", length = 200)
    private String mallProductName;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
