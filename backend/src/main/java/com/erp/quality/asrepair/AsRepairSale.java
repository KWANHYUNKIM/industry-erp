package com.erp.quality.asrepair;

import jakarta.persistence.*;
import lombok.*;

/**
 * 원본 [판매연결전표] — 수리에서 만든 판매 전표. 판매는 trade 의 것이라 id 만 든다
 * (trade 가 quality 를 알면 순환이 된다). 재고 차감 · 매출은 그 판매가 한다.
 */
@Entity
@Table(name = "as_repair_sales")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AsRepairSale {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "as_repair_id")
    private AsRepair repair;

    @Column(name = "sales_id", nullable = false, unique = true)
    private Long salesId;
}
