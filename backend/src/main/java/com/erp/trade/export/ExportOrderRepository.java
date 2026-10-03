package com.erp.trade.export;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ExportOrderRepository extends JpaRepository<ExportOrder, Long> {

    @Query("select distinct e from ExportOrder e join fetch e.buyer join fetch e.currency " +
            "left join fetch e.lines l left join fetch l.item " +
            "where e.invoiceDate >= :from and e.invoiceDate <= :to " +
            "order by e.invoiceDate desc, e.id desc")
    List<ExportOrder> findAllWithRefs(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                             @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);

    /** Invoice 번호는 회사 안에서 하나다(테이블 unique) — 저장 전에 알아 듣기 쉬운 말로 막는다. */
    boolean existsByInvoiceNoAndIdNot(String invoiceNo, Long id);

    boolean existsByInvoiceNo(String invoiceNo);
}
