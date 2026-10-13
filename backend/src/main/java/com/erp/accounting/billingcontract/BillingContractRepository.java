package com.erp.accounting.billingcontract;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface BillingContractRepository extends JpaRepository<BillingContract, Long> {

    @Query("select coalesce(max(c.docNo), 0) from BillingContract c where c.contractDate = :date")
    int maxDocNo(@Param("date") LocalDate date);

    @Query(value = "select coalesce(max(cast(code as integer)), 0) from billing_contracts where code ~ '^[0-9]+$'", nativeQuery = true)
    int maxNumericCode();

    boolean existsByCode(String code);

    /** 청구예정자료가 붙은 계약인가(contract_bill_lines 는 contractbill 기능의 표라 네이티브로 본다). */
    @Query(value = "select exists(select 1 from contract_bill_lines bl join billing_contract_lines l on l.id = bl.contract_line_id where l.contract_id = :id)", nativeQuery = true)
    boolean hasBills(@Param("id") Long id);

    @Query("select distinct c from BillingContract c join fetch c.partner left join fetch c.project " +
           "where c.contractDate >= :from and c.contractDate <= :to order by c.contractDate desc, c.docNo desc")
    List<BillingContract> findInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select l from BillingContractLine l join fetch l.item left join fetch l.billingUnit where l.contract.id in :ids order by l.lineNo")
    List<BillingContractLine> findLinesOf(@Param("ids") List<Long> ids);

    @Query("select l from BillingContractLine l join fetch l.contract c join fetch c.partner join fetch l.item left join fetch l.billingUnit " +
           "where c.billEnd >= :fromDay and c.billStart <= :toDay order by c.contractDate, c.docNo, l.lineNo")
    List<BillingContractLine> findLinesActiveBetween(@Param("fromDay") LocalDate fromDay, @Param("toDay") LocalDate toDay);

    @Query("select l from BillingContractLine l join fetch l.contract c join fetch c.partner join fetch l.item left join fetch l.billingUnit where l.id in :ids")
    List<BillingContractLine> findLinesById(@Param("ids") List<Long> ids);
}
