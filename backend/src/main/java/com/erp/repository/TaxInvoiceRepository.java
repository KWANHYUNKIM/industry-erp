package com.erp.repository;

import com.erp.domain.TaxInvoice;
import com.erp.domain.TaxInvoiceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface TaxInvoiceRepository extends JpaRepository<TaxInvoice, Long> {

    boolean existsBySales_Id(Long salesId);

    boolean existsByPurchase_Id(Long purchaseId);

    @Query("select distinct t from TaxInvoice t join fetch t.partner " +
            "where t.invoiceType = :type and t.issueDate between :from and :to " +
            "order by t.issueDate desc, t.id desc")
    List<TaxInvoice> findByTypeAndPeriod(@Param("type") TaxInvoiceType type,
                                         @Param("from") LocalDate from,
                                         @Param("to") LocalDate to);

    @Query(value = "select coalesce(max(cast(split_part(invoice_no, '-', 3) as integer)), 0) " +
            "from tax_invoices where issue_date = :date", nativeQuery = true)
    int maxSeq(@Param("date") LocalDate date);
}
