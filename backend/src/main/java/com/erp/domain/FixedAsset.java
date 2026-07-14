package com.erp.domain;

import com.erp.domain.enums.AssetStatus;
import com.erp.domain.enums.DepreciationMethod;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

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
