package com.erp.accounting.journal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface JournalEntrySalesRepository extends JpaRepository<JournalEntrySales, Long> {

    /** 이 판매들이 묶여 있는 연결(전표 · 판매까지 한 번에). */
    @Query("select l from JournalEntrySales l join fetch l.journalEntry join fetch l.sales where l.sales.id in :salesIds")
    List<JournalEntrySales> findBySalesIds(@Param("salesIds") Collection<Long> salesIds);

    @Query("select l from JournalEntrySales l join fetch l.sales where l.journalEntry.id = :entryId")
    List<JournalEntrySales> findByEntryId(@Param("entryId") Long entryId);

    /**
     * 묶음 전표가 덮은 판매 쪽 금액 — 거래처별. 판매가 전부 반영된 것은 <b>지금의 판매 합계</b>(반영 뒤 판매를 고쳤으면 고친 값)를
     * 그 판매에 걸린 첫 연결에서 한 번만 센다.
     */
    @Query("select e.partner.id, coalesce(sum(case when s.accountingReflected = true " +
            "then (case when l.id = (select min(l2.id) from JournalEntrySales l2 where l2.sales = s) then s.totalAmount else 0 end) " +
            "else l.salesAmount end), 0) " +
            "from JournalEntrySales l join l.journalEntry e join l.sales s " +
            "where e.partner is not null and e.entryDate <= :until group by e.partner.id")
    List<Object[]> sumBatchSalesSide(@Param("until") java.time.LocalDate until);

    /** 판매마다 전표를 만든 옛 반영(출처 SALES) — 그 판매의 지금 합계, 거래처별. */
    @Query("select e.partner.id, coalesce(sum(s.totalAmount), 0) from JournalEntry e, Sales s " +
            "where e.sourceType = com.erp.accounting.journal.JournalSourceType.SALES and e.sourceId = s.id " +
            "and e.partner is not null and e.entryDate <= :until group by e.partner.id")
    List<Object[]> sumLegacySalesSide(@Param("until") java.time.LocalDate until);
}
