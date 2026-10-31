package com.erp.accounting.ledger.journal;

import com.erp.trade.sales.Sales;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 회계전표 ↔ 판매 연결(여러 건). {@link JournalSourceType#SALES_BATCH} 전표가 쓴다.
 *
 * <p>원본 판매일괄회계반영(E040215, 2026-10-22 재기): 같은 거래처의 판매 여러 건을 [매출전표 I] 한 번에 전표 한 장으로 묶는다.
 * 전표가 판매 여럿을 담아야 해서 (출처, id) 한 칸으로는 모자란다. 반영취소 · 판매 삭제 · 전표 삭제 때 묶인 판매가 모두 미반영으로 돌아온다.
 * salesAmount = 이 전표가 덮은 판매 쪽 금액(판매 전체면 판매 합계, 일부 줄이면 그 줄들의 공급가+부가세).
 */
@Entity
@Table(name = "journal_entry_sales")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JournalEntrySales {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "journal_entry_id", nullable = false)
    private JournalEntry journalEntry;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sales_id", nullable = false)
    private Sales sales;

    @Column(name = "sales_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal salesAmount;

    public JournalEntrySales(JournalEntry journalEntry, Sales sales, BigDecimal salesAmount) {
        this.journalEntry = journalEntry;
        this.sales = sales;
        this.salesAmount = salesAmount;
    }
}
