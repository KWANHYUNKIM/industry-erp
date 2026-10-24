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

    /** 수수료(원본 E010611 · E010612) — 취득원가에 안 들어가고 지급수수료(판)로 간다. */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal fee = BigDecimal.ZERO;

    /** 감소의 [처분손익계정](원본 필수 — 비면 '처분이익 또는 처분손실 관련 계정을 입력 바랍니다.'). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gain_loss_account_id")
    private Account gainLossAccount;

    /** 거래처(원본 증가 · 감소 전표의 [거래처]) — 분개 줄에 붙는다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private com.erp.trade.partner.BusinessPartner partner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 200)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
