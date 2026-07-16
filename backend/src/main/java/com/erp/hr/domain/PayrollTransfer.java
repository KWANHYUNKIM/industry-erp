package com.erp.hr.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.accounting.domain.BankAccount;
import com.erp.accounting.domain.JournalEntry;
import com.erp.common.BaseTimeEntity;

/**
 * 급여이체. 확정된 급여명세 여러 건을 묶어 회사 계좌에서 실지급액을 한 번에 내보낸다.
 *
 * 분개(지급 시점):
 *   차) 급여(801) 지급총액
 *   대) 예수금(254) 공제합계   — 4대보험·소득세는 회사가 대신 떼어 두었다가 납부한다
 *   대) 예금계정 실지급액       — 실제로 계좌에서 나가는 금액
 */
@Entity
@Table(name = "payroll_transfers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayrollTransfer extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 이체번호 (예: PT-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String transferNo;

    /** 귀속월 (yyyy-MM) */
    @Column(nullable = false, length = 7)
    private String payMonth;

    @Column(nullable = false)
    private LocalDate transferDate;

    /** 급여가 빠져나가는 회사 계좌 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bank_account_id", nullable = false)
    private BankAccount bankAccount;

    /** 지급총액 (기본급 + 수당) */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal totalPay;

    /** 공제합계 (4대보험·소득세 등) */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal totalDeduction;

    /** 실지급액 = 지급총액 − 공제합계. 계좌에서 실제로 나가는 금액 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal netPay;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "transfer", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<PayrollTransferLine> lines = new ArrayList<>();

    public void addLine(PayrollTransferLine line) {
        line.setTransfer(this);
        lines.add(line);
    }
}
