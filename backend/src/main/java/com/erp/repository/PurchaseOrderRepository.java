package com.erp.repository;

import com.erp.domain.PurchaseOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {

    @Query("select distinct po from PurchaseOrder po join fetch po.partner " +
            "left join fetch po.employee left join fetch po.warehouse " +
            "left join fetch po.lines l left join fetch l.item left join fetch l.partner " +
            "order by po.orderDate desc, po.id desc")
    List<PurchaseOrder> findAllWithRefs();
}
