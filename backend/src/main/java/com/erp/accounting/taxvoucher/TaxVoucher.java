package com.erp.accounting.taxvoucher;

import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 세무 &gt; 부가세 &gt; 신고전검토자료 &gt; <b>(세금)계산서발행/수령</b>의 계산서 한 장 — 원본 E030202 [매출(세금)계산서발행] ·
 * [매입(세금)계산서수령] 창(2026-10-12 loginaa 실측).
 *
 * <p>회계전표와 따로 도는 부가세 신고용 자료다. 원본에서 매출 100,000 · 부가세 10,000 을 저장해도 분개장에 줄이 생기지 않았고,
 * 매출(세금)계산서조회(세무)에만 [내역보기] '세무' 로 떴다. [일자-No.] 의 No. 는 같은 날 몇 번째 장인지다.
 */
@Entity
@Table(name = "tax_vouchers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class TaxVoucher extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private TaxVoucherSide side;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(name = "entry_no", nullable = false)
    private Integer entryNo;

    /** 원본 [부가세유형] 글자 그대로(세금계산서 · 영세율 · 계산서 …). */
    @Column(name = "vat_type", nullable = false, length = 30)
    private String vatType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Column(name = "supply_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;
}
