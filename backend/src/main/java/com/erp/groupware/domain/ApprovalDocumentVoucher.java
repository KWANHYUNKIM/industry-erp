package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import com.erp.accounting.domain.Expense;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;

/**
 * 기안서에 연결된 ERP 전표. (이카운트 목록의 'ERP전표(건)' / '연결전표')
 *
 * 전표 종류마다 컬럼을 따로 두고, DB CHECK 로 셋 중 정확히 하나만 채워지도록 강제한다.
 * (voucher_type + voucher_id 식 다형 참조는 FK 를 걸 수 없어 고아 행을 막지 못한다)
 */
@Entity
@Table(name = "approval_document_vouchers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalDocumentVoucher {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false)
    private ApprovalDocument document;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_id")
    private Sales sales;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_id")
    private Purchase purchase;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_id")
    private Expense expense;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    /** 전표 종류 (SALES / PURCHASE / EXPENSE) */
    @Transient
    public String getVoucherType() {
        if (sales != null) return "SALES";
        if (purchase != null) return "PURCHASE";
        return "EXPENSE";
    }

    /** 화면에 보여줄 전표번호. 지출결의(expenses)는 전표번호 컬럼이 없어 id 로 만든다. */
    @Transient
    public String getVoucherNo() {
        if (sales != null) return sales.getDocNo();
        if (purchase != null) return purchase.getDocNo();
        return expense != null ? "EXP-" + expense.getId() : null;
    }

    @Transient
    public Long getVoucherId() {
        if (sales != null) return sales.getId();
        if (purchase != null) return purchase.getId();
        return expense != null ? expense.getId() : null;
    }
}
