package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 월별 감가상각 실적. (asset, period) 로 유니크라서 같은 달을 두 번 돌려도 중복 상각되지 않는다.
 * 상각과 동시에 차)감가상각비 / 대)감가상각누계액 분개가 붙는다.
 */
@Entity
@Table(name = "depreciations",
        uniqueConstraints = @UniqueConstraint(name = "uk_depreciations_asset_period",
                columnNames = {"asset_id", "period"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Depreciation extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "asset_id", nullable = false)
    private FixedAsset asset;

    /** 상각 귀속월 (yyyy-MM) */
    @Column(nullable = false, length = 7)
    private String period;

    @Column(nullable = false)
    private LocalDate depreciationDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** 상각 후 누계액 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal accumulatedAfter;

    /** 상각 후 장부가액 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal bookValueAfter;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 50)
    private String createdBy;
}
