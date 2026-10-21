package com.erp.accounting.fixedasset;

import com.erp.accounting.account.Account;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 고정자산. 취득 후 매달 감가상각을 돌려 누계액을 쌓고, 처분하면 장부에서 털어낸다.
 * 장부가액 = 취득가액 - 감가상각누계액 이고, 잔존가액 아래로는 내려가지 않는다.
 * assetAccount 는 이 자산이 올라가 있는 자산계정(기계장치·차량운반구·비품 등)이다.
 */
@Entity
@Table(name = "fixed_assets")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FixedAsset extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 자산번호 (예: FA-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String assetNo;

    @Column(nullable = false, length = 100)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "asset_account_id", nullable = false)
    private Account assetAccount;

    /** 감가상각충당금(누계액) 계정 — 원본 자산마다 고른다. 비면 203 감가상각누계액. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "accum_account_id")
    private Account accumAccount;

    /** 감가상각비 계정 — 비면 818 감가상각비. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_account_id")
    private Account expenseAccount;

    /** 취득(증가) 분개의 대변 — 원본 [출금계좌](기본 외상매입금). 예전 자산은 비어 있고 취득 분개가 없다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "payment_account_id")
    private Account paymentAccount;

    /** 취득 부가세(부가세대급금). */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal acquisitionVat = BigDecimal.ZERO;

    @Column(nullable = false)
    private LocalDate acquisitionDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal acquisitionCost;

    /** 잔존가액. 상각은 여기까지만 내려간다. */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal salvageValue;

    /** 내용연수(년). 정액법에서 월 상각액 계산에 쓴다. */
    @Column(nullable = false)
    private Integer usefulLifeYears;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DepreciationMethod method;

    /** 정률법 연 상각률(%). 정액법이면 비워둔다. */
    @Column(precision = 5, scale = 2)
    private BigDecimal declineRate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal accumulatedDepreciation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AssetStatus status;

    private LocalDate disposalDate;

    @Column(precision = 18, scale = 2)
    private BigDecimal disposalAmount;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    private DisposalType disposalType;

    /** 매각 부가세(부가세예수금). */
    @Column(precision = 18, scale = 2)
    private BigDecimal disposalVat;

    /** 감소 분개의 입금 계정 — 원본 [입금계좌](기본 외상매출금). 비면 101 현금. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "receipt_account_id")
    private Account receiptAccount;

    @Column(length = 200)
    private String remark;

    @Column(length = 50)
    private String createdBy;

    /** 장부가액 = 취득가액 - 감가상각누계액 */
    public BigDecimal bookValue() {
        return acquisitionCost.subtract(accumulatedDepreciation);
    }

    /** 앞으로 더 상각할 수 있는 금액 (잔존가액 아래로는 내려가지 않는다) */
    public BigDecimal depreciableRemaining() {
        return bookValue().subtract(salvageValue).max(BigDecimal.ZERO);
    }
}
