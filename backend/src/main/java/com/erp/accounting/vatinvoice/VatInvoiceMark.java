package com.erp.accounting.vatinvoice;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 세금계산서(부가세 줄이 든 회계전표 한 장)의 구분값 — 원본 세무 › 부가세 › 신고전검토자료 › 각종구분값변경(E010723).
 * 줄이 없으면 전자(세금)계산서 · 발행 안됨이다.
 */
@Entity
@Table(name = "vat_invoice_marks")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
public class VatInvoiceMark extends BaseTimeEntity {

    @Id
    @Column(name = "journal_entry_id")
    private Long journalEntryId;

    @Enumerated(EnumType.STRING)
    @Column(name = "doc_kind", nullable = false, length = 20)
    private VatDocKind docKind;

    @Enumerated(EnumType.STRING)
    @Column(name = "progress", nullable = false, length = 10)
    private VatInvoiceProgress progress;

    public static VatInvoiceMark blank(Long journalEntryId) {
        return new VatInvoiceMark(journalEntryId, VatDocKind.ELECTRONIC, VatInvoiceProgress.NONE);
    }
}
