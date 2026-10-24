package com.erp.accounting.contractbill;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ContractBillRepository extends JpaRepository<ContractBill, Long> {

    @Query("select coalesce(max(b.docNo), 0) from ContractBill b where b.billDate = :date")
    int maxDocNo(@Param("date") LocalDate date);

    @Query("select b from ContractBill b where b.billDate >= :from and b.billDate <= :to order by b.billDate desc, b.docNo desc")
    List<ContractBill> findInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select l from ContractBillLine l join fetch l.contractLine cl join fetch cl.contract c join fetch c.partner " +
           "join fetch cl.item left join fetch cl.billingUnit where l.bill.id in :ids order by l.lineNo")
    List<ContractBillLine> findLinesOf(@Param("ids") List<Long> ids);

    /** 회계/판매일괄반영 · 회계미반영현황(계약) — 청구자료생성일자로 거른 줄 전부(계약 · 거래처 · 항목 · 매출계정 · 청구단위 · 프로젝트까지). */
    @Query("select l from ContractBillLine l join fetch l.bill b join fetch l.contractLine cl join fetch cl.contract c join fetch c.partner " +
           "left join fetch c.project join fetch cl.item i left join fetch i.salesAccount left join fetch cl.billingUnit " +
           "where b.billDate >= :from and b.billDate <= :to order by b.billDate, b.docNo, l.lineNo")
    List<ContractBillLine> findLinesInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select l from ContractBillLine l join fetch l.bill join fetch l.contractLine cl join fetch cl.contract c join fetch c.partner " +
           "where l.id in :ids")
    List<ContractBillLine> findLinesByIds(@Param("ids") List<Long> ids);

    /** [회계전표삭제] · 회계전표번호보기 — 회계반영 연결이 남은 줄(반영 전표를 지웠어도). */
    @Query("select l from ContractBillLine l join fetch l.bill where l.reflectedEntryDate is not null or l.journalEntryId is not null")
    List<ContractBillLine> findAccountingLinkedLines();

    /** 매출(세금)계산서현황(계약) — 반영된 줄(전표 id 별로 묶는다). */
    @Query("select l from ContractBillLine l join fetch l.bill where l.journalEntryId is not null")
    List<ContractBillLine> findReflectedLines();

    /** 청구예정자료미생성현황 — 이미 만든 (계약 줄, 청구예정월) 짝. */
    @Query("select l.contractLine.id, l.billMonth from ContractBillLine l where l.billMonth >= :fromMonth and l.billMonth <= :toMonth")
    List<Object[]> findBilledMonths(@Param("fromMonth") String fromMonth, @Param("toMonth") String toMonth);
}
