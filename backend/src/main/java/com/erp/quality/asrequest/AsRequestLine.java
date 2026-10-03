package com.erp.quality.asrequest;

import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.*;

/**
 * A/S접수 품목 줄 — 원본 A/S접수입력 격자 [품목코드 · 품목명 · 수량](2026-10-03 loginaa 실측).
 * 맡긴 물건이라 재고는 움직이지 않는다(재고가 빠지는 것은 수리에 쓴 소모부품 AsPart 다).
 */
@Entity
@Table(name = "as_request_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AsRequestLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "as_request_id")
    private AsRequest asRequest;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private Item item;

    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity;
}
