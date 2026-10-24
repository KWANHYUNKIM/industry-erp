package com.erp.accounting.importcost;

import com.erp.accounting.account.Account;
import com.erp.accounting.bankcard.BankAccount;
import com.erp.accounting.journal.JournalEntry;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.project.Project;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 수입비용 전표 한 장(원본 E060202 ~ E060207). 저장하면 회계전표가 한 장 같이 생기고({@link #journalEntry}), 지우면 같이 지워진다.
 *
 * <ul>
 *   <li>서류징수시: {@link #account} = 출금계좌(대변, 기본 251 외상매입금).</li>
 *   <li>자금지급시: {@link #bankAccount} = 출금계좌(대변 = 그 계좌의 예금계정).</li>
 *   <li>본계정대체: {@link #account} = 구입자산(차변).</li>
 * </ul>
 */
@Entity
@Table(name = "import_cost_vouchers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ImportCostVoucher extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "voucher_date", nullable = false)
    private LocalDate voucherDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ImportCostKind kind;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lot_id", nullable = false)
    private ImportLot lot;

    /** 거래처 — 관세사에지급이면 관세사. 본계정대체는 없다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 비용항목 — (세금)계산서수령 · 일반영수증수령만. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cost_item_id")
    private ImportCostItem costItem;

    /** 금액(세금계산서는 공급가액). */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal amount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vat = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal fee = BigDecimal.ZERO;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private Account account;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    /** 부서 — hr 를 참조하지 않으려 id 만 든다(CLAUDE.md 4.1). */
    @Column(name = "department_id")
    private Long departmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /** (세금)계산서수령의 [부가세유형] — 원본 기본 '세금계산서'. */
    @Column(name = "vat_type", length = 30)
    private String vatType;

    @Column(length = 300)
    private String remark;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
