package com.erp.accounting.fixedasset;

import com.erp.accounting.account.Account;
import com.erp.accounting.journal.JournalEntry;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 고정자산 증가 · 감소 전표 한 장. 자산 하나에 여러 장이고 각각 회계전표 한 장을 만든다(원본 2026-10-21 실측).
 * 감소의 amount 는 취득원가 몫(원본: 증가 합계 단가 × 수량), accumAmount 는 사람이 넣은 감가상각누계액.
 */
@Entity
@Table(name = "fixed_asset_movements")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FixedAssetMovement extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "asset_id", nullable = false)
    private FixedAsset asset;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private MovementKind kind;

    @Column(nullable = false)
    private LocalDate slipDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vat = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal accumAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal saleAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    private DisposalType disposalType;

    /** 처분손익 = 매각액 + 누계 − 취득원가 몫(원본). 증가는 0. */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal gainLoss = BigDecimal.ZERO;

    /** 증가 = 출금계좌, 감소 = 입금계좌. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 200)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
