package com.erp.domain;

import com.erp.domain.enums.FastVoucherType;
import com.erp.domain.enums.PaymentMethod;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * FastEntry 간편전표 — 지출결의서 · 입금보고서 · 가지급금정산서.
 * 라인(비용/수입 계정별 금액)과 결제수단만 입력하면 복식부기 분개는 서비스가 만든다.
 */
@Entity
@Table(name = "fast_vouchers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FastVoucher extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: FV-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String voucherNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private FastVoucherType type;

    @Column(nullable = false)
    private LocalDate voucherDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentMethod method;

    /** method = BANK 일 때만 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 가지급금정산서에서만: 먼저 지급했던 가지급금 총액 */
    @Column(precision = 18, scale = 2)
    private BigDecimal advanceAmount;

    /** 라인 합계 (지출총액 / 입금총액 / 실사용액) */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal totalAmount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 200)
    private String description;

    @Column(length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "voucher", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<FastVoucherLine> lines = new ArrayList<>();

    public void addLine(FastVoucherLine line) {
        line.setVoucher(this);
        line.setLineNo(lines.size() + 1);
        lines.add(line);
    }
}
