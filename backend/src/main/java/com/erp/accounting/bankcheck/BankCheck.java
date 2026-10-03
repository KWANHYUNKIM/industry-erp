package com.erp.accounting.bankcheck;

import com.erp.accounting.bankcard.BankAccount;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;

/**
 * 수표. 받은수표는 보유하다가 계좌에 입금하거나 부도가 나고,
 * 발행수표는 당좌계좌에서 끊는 순간 예금이 빠지고(회계 반영) 나중에 은행 인출이 확인되면 결제완료로 표시한다.
 */
@Entity
@Table(name = "bank_checks")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BankCheck extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 수표번호 (예: 가1234567) */
    @Column(nullable = false, unique = true, length = 30)
    private String checkNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CheckType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CheckStatus status;

    /** 받은수표는 수취일, 발행수표는 발행일 */
    @Column(nullable = false)
    private LocalDate issueDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** 발행 은행(받은수표는 수표에 적힌 은행) */
    @Column(length = 50)
    private String bankName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 발행수표는 끊어 준 당좌계좌, 받은수표는 입금한 계좌 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    /** 받은수표를 입금하거나 발행수표가 인출된 날 */
    private LocalDate settledDate;

    /**
     * 손을 떠날 때(입금 · 부도) 만든 회계전표 id. 원본 수령수표감소현황의 [일자-No.] 가 이 전표다(V239).
     * 받을 때의 분개는 source_id 로 이미 잇는다. 발행수표 결제는 분개가 없어 비어 있다.
     */
    @Column(name = "settle_journal_id")
    private Long settleJournalId;

    @Column(length = 200)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
