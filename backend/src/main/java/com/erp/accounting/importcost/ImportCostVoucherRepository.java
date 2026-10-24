package com.erp.accounting.importcost;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ImportCostVoucherRepository extends JpaRepository<ImportCostVoucher, Long> {

    @Query("select v from ImportCostVoucher v join fetch v.lot l left join fetch v.partner left join fetch v.costItem " +
           "left join fetch v.account left join fetch v.bankAccount left join fetch v.project left join fetch v.journalEntry " +
           "where v.voucherDate between :from and :to order by v.voucherDate desc, v.id desc")
    List<ImportCostVoucher> findInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 수입관리대장 — 기간 끝까지의 전표(이월잔액은 기간 앞 전표로 센다). */
    @Query("select v from ImportCostVoucher v join fetch v.lot l join fetch l.partner left join fetch v.costItem " +
           "where v.voucherDate <= :to order by v.voucherDate, v.id")
    List<ImportCostVoucher> findUntil(@Param("to") LocalDate to);

    boolean existsByLotId(Long lotId);

    boolean existsByCostItemId(Long costItemId);
}
