package com.erp.repository;

import com.erp.domain.ExportOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ExportOrderRepository extends JpaRepository<ExportOrder, Long> {

    @Query("select distinct e from ExportOrder e join fetch e.buyer join fetch e.currency " +
            "left join fetch e.lines l left join fetch l.item " +
            "order by e.invoiceDate desc, e.id desc")
    List<ExportOrder> findAllWithRefs();
}
