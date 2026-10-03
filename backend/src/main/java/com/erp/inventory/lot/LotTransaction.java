package com.erp.inventory.lot;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 로트 입출고 이력 한 건. 로트 생성(입고)·소모(출고)·조정 시 기록되어 로트 수불부/내역조회의 근거가 된다.
 * balanceAfter 는 해당 로트의 그 시점 재고(running balance)다.
 */
@Entity
@Table(name = "lot_transactions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class LotTransaction extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lot_id", nullable = false)
    private Lot lot;

    @Column(name = "tx_date", nullable = false)
    private LocalDate txDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LotTxType type;

    @Column(name = "quantity_change", nullable = false, precision = 18, scale = 2)
    private BigDecimal quantityChange;

    @Column(name = "balance_after", nullable = false, precision = 18, scale = 2)
    private BigDecimal balanceAfter;

    @Column(length = 300)
    private String note;

    /*
     * 원본 시리얼/로트No.내역조회(E040618)의 [전표구분] · [연결전표-No.]. 구매 · 판매 같은 전표가 남긴 줄이면
     * 그 전표 종류('구매') · id · 번호를 든다 — 그 줄은 그 전표에서만 고치고 지운다(원본 안내 문구).
     * 로트등록 · 소모 · 실사조정으로 직접 남긴 줄은 셋 다 null 이다.
     */
    @Column(name = "doc_type", length = 30)
    private String docType;

    @Column(name = "source_id")
    private Long sourceId;

    @Column(name = "source_no", length = 40)
    private String sourceNo;

    /** 원본 내역현황의 [거래처] — 전표의 거래처 이름(inventory 는 trade 의 거래처를 모른다). */
    @Column(name = "partner_name", length = 100)
    private String partnerName;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
