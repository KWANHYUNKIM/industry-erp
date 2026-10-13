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

}
