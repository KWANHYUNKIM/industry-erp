package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 단가적용순서 설정. 영업/구매별로 단가 산출 기능의 적용 우선순위·사용여부를 저장.
 */
@Entity
@Table(name = "price_order_settings",
        uniqueConstraints = @UniqueConstraint(name = "uk_price_order_cat_fn", columnNames = {"category", "function_name"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PriceOrderSetting extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 구분: SALES(영업) / PURCHASE(구매) */
    @Column(nullable = false, length = 20)
    private String category;

    @Column(name = "function_name", nullable = false, length = 100)
    private String functionName;

    @Column(nullable = false)
    private int applyOrder;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
