package com.erp.accounting.taxvoucher;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface TaxVoucherRepository extends JpaRepository<TaxVoucher, Long> {

    @Query("select coalesce(max(v.entryNo), 0) from TaxVoucher v where v.entryDate = :date")
    int maxEntryNo(@Param("date") LocalDate date);

    @Query("select v from TaxVoucher v join fetch v.partner where v.entryDate between :from and :to " +
           "order by v.entryDate desc, v.entryNo desc")
    List<TaxVoucher> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
