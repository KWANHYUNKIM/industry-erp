package com.erp.trade.purchaseorder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface PurchaseOrderLineRepository extends JpaRepository<PurchaseOrderLine, Long> {

    /** 베낄 앞 전표 줄과 그 머리(번호 · 일자)를 한 번에. */
    @Query("select l from PurchaseOrderLine l join fetch l.purchaseOrder where l.id = :id")
    Optional<PurchaseOrderLine> findWithOrderById(Long id);
}
