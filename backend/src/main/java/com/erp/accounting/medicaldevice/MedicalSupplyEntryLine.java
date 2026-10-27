package com.erp.accounting.medicaldevice;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.*;

/**
 * 보고 한 줄 — 원본 입력 격자의 열 그대로. 판매 줄을 불러왔으면 그 줄 id 를 든다(<b>한 번만</b> 보고한다).
 * 품목 · 거래처 · 판매 줄은 다른 모듈의 것이라 id 와 이름만 적어 둔다(보고는 그때 값을 남기는 문서다).
 */
@Entity
@Table(name = "medical_supply_entry_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MedicalSupplyEntryLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "entry_id")
    private MedicalSupplyEntry entry;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    /** [불러온 전표] — 판매 줄 id. 손으로 넣은 줄은 비어 있다. */
    @Column(name = "sales_line_id", unique = true)
    private Long salesLineId;

    /** [불러온 전표일자-No.] */
    @Column(name = "source_doc_no", length = 40)
    private String sourceDocNo;

    /** [표준코드(UDI)] — (01)UDI-DI(10)시리얼/로트 */
    @Column(length = 120)
    private String udi;

    @Column(name = "delivery_date")
    private LocalDate deliveryDate;

    /** [중고 의료기기 여부] */
    @Column(nullable = false)
    @Builder.Default
    private boolean used = false;

    /** [통합시스템거래처코드] */
    @Column(name = "partner_system_code", length = 50)
    private String partnerSystemCode;

    @Column(name = "partner_id")
    private Long partnerId;

    @Column(name = "partner_name", length = 100)
    private String partnerName;

    /** [납품장소가다름여부] */
    @Column(name = "different_place", nullable = false)
    @Builder.Default
    private boolean differentPlace = false;

    @Column(name = "item_id")
    private Long itemId;

    @Column(name = "item_name", length = 200)
    private String itemName;

    @Column(nullable = false, precision = 18, scale = 4)
    @Builder.Default
    private BigDecimal quantity = BigDecimal.ZERO;

    @Column(name = "unit_price", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;
}
