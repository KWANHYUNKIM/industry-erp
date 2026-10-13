package com.erp.trade.price;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 특별단가그룹(원본 E040124 [특별단가그룹] 알약). 단가는 이 그룹에 붙고({@link SpecialPrice} · {@link SpecialPriceItemGroup}),
 * 거래처(영업 · 구매 단가그룹 칸에 이 그룹의 <b>코드</b>)와 창고({@link SpecialPriceGroupWarehouse})가 이 그룹을 든다.
 */
@Entity
@Table(name = "special_price_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SpecialPriceGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
