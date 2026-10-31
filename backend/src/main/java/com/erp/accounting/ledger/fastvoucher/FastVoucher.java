package com.erp.accounting.ledger.fastvoucher;

import com.erp.accounting.fund.bankcard.BankAccount;
import com.erp.accounting.ledger.journal.JournalEntry;
import com.erp.accounting.PaymentMethod;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;

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

    /** 영수증으로 [거래처명] — 거래처 등록 없이 친 이름(원본 'QA회계1-식당' 이 회계거래조회 거래처명에 그대로). */
    @Column(length = 100)
    private String payeeName;

    /** 영수증으로 [수수료] — 지급수수료로 따로 분개하고 출금계좌에서는 금액+수수료가 나간다. */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal fee = BigDecimal.ZERO;

    /** 현금거래 — 계좌간이동의 [출금계좌] · 은행차입으로 · 은행으로의 [차입처]. 머리 {@link #bankAccount} 의 맞은편 계좌. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "counter_bank_account_id")
    private BankAccount counterBankAccount;

    /** 법인카드대금결제 [카드]. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "credit_card_id")
    private com.erp.accounting.fund.bankcard.CreditCard creditCard;

    /** 카드매출대금회수 [카드사]. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "card_issuer_id")
    private com.erp.accounting.fund.cardissuer.CardIssuer cardIssuer;

    /** 일시적으로(입금 · 출금) [사원] — hr 를 참조하지 않으려 id 만 든다(이름은 {@link #payeeName}). */
    @Column(name = "employee_id")
    private Long employeeId;

    /** 카드매출대금회수 [수수료율](%). */
    @Column(name = "fee_rate", precision = 7, scale = 3)
    private BigDecimal feeRate;

    /** 현금거래 한 장 입력의 [부서] — hr 를 참조하지 않으려 id 만 든다. */
    @Column(name = "department_id")
    private Long departmentId;

    /** 현금거래 한 장 입력의 [프로젝트]. */
    @Column(name = "project_id")
    private Long projectId;

    @OneToMany(mappedBy = "voucher", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<FastVoucherLine> lines = new ArrayList<>();

    public void addLine(FastVoucherLine line) {
        line.setVoucher(this);
        line.setLineNo(lines.size() + 1);
        lines.add(line);
    }
}
