package com.erp.accounting.contractitem;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 계약항목등록 [수량별단가 › 설정] 창 한 줄 — 수량 N 이상이면 이 단가(VAT포함 여부).
 * 원본 00003 정수기 렌탈비_월말청구 목록 [수량별단가] 50,000. 원본 [설정] 창 칸은 미실측이라
 * 품목연결설정과 같은 꼴(줄 목록)로 두었다 — 목록 [수량별단가] 는 첫 줄(가장 작은 수량)의 단가.
 */
@Entity
@Table(name = "contract_item_qty_prices")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ContractItemQtyPrice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "contract_item_id", nullable = false)
    private ContractItem contractItem;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @Column(name = "min_quantity", nullable = false, precision = 18, scale = 2)
    private BigDecimal minQuantity;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "vat_included", nullable = false)
    private boolean vatIncluded;
}
