package com.erp.trade.quotation;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.inventory.item.Item;

/** 견적서 명세(품목 라인). */
@Entity
@Table(name = "quotation_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QuotationLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    @Column(name = "line_no", nullable = false)
    @Builder.Default
    private Integer lineNo = 1;

    /** 줄 적요(선택). 원본 견적서입력 줄 열 '적요'. */
    @Column(length = 255)
    private String remark;

    /**
     * 줄 규격. 원본은 전표 줄의 [규격] 을 줄마다 따로 저장한다 — 품목을 고르면 품목 규격으로 채워지지만
     * 줄에서 고치거나 비울 수 있고, 저장된 값이 그대로 보인다(2026-10-28 loginaa: 같은 D001 이 견적 11/15-2 는 '[대형]', 11/20-1 은 빈칸).
     * 비어 있으면(null) 품목 규격으로 본다. 빈 글자("")는 일부러 비운 것이다.
     */
    @Column(name = "spec", length = 200)
    private String spec;

    /** 화면에 보일 규격 — 줄에 저장된 값, 저장 전 옛 줄(null)이면 품목 규격. */
    public String effectiveSpec() {
        return spec != null ? spec : (getItem() == null ? null : getItem().getSpec());
    }
}
