package com.erp.accounting.contractitem;

import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 계약항목등록 [품목별단가 › 설정] 창 '품목연결설정' 한 줄 — 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세
 * (2026-10-13 loginaa 실측: 00007 렌탈 품목관리 = D001 HZ-7070 안마의자 1 × 120,000 · 12,000 / D002 JYP-5000 안마침대 1 × 220,000 · 22,000,
 * 합계 2 · 340,000 · 34,000 → 목록 [품목별단가] 340,000). 계약입력 줄의 [상세]가 이 줄들을 복사해 쓴다.
 */
@Entity
@Table(name = "contract_item_products")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ContractItemProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "contract_item_id", nullable = false)
    private ContractItem contractItem;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    /** 규격 — 사용자가 친 글. 원본처럼 품목 규격을 자동으로 찍지 않는다(2026-10-29 데이터이관 QA C4: 원본 칸 비어 있음). */
    @Column(length = 100)
    private String spec;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;
}
