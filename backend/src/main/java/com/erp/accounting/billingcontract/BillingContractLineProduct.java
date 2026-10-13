package com.erp.accounting.billingcontract;

import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 계약입력 줄 [상세] → '품목연결설정' 한 줄. 줄에 계약항목을 넣으면 계약항목등록의 품목연결설정을 복사해 보여 주고, [적용(F8)]해야 계약 줄에 붙는다.
 * 이 줄이 있는 계약 줄의 청구자료만 회계/판매일괄반영 [판매반영]에 나온다(원본 도움말: '계약입력 시, 입력한 계약항목의 상세-품목연결설정을 해야합니다.').
 */
@Entity
@Table(name = "billing_contract_line_products")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BillingContractLineProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "contract_line_id", nullable = false)
    private BillingContractLine contractLine;

    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;
}
