package com.erp.trade.salesorder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface SalesOrderLineRepository extends JpaRepository<SalesOrderLine, Long> {

    /** 주문서출고처리 [출고] — 고른 줄을 주문 · 품목과 함께. */
    @Query("select l from SalesOrderLine l join fetch l.salesOrder o join fetch o.partner join fetch l.item where l.id in :ids")
    List<SalesOrderLine> findWithOrderByIds(@Param("ids") Collection<Long> ids);
}
