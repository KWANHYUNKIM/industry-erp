package com.erp.repository;

import com.erp.domain.SalesOrder;
import com.erp.domain.SalesOrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SalesOrderRepository extends JpaRepository<SalesOrder, Long> {

    @Query("select o from SalesOrder o join fetch o.partner " +
            "order by o.orderDate desc, o.id desc")
    List<SalesOrder> findAllWithPartner();

    /** 지정 상태의 주문을 라인·품목까지 fetch (미출하현황용) */
    @Query("select distinct o from SalesOrder o " +
            "join fetch o.partner " +
            "join fetch o.lines l join fetch l.item " +
            "where o.status in :statuses " +
            "order by o.dueDate asc, o.orderDate desc, o.id desc")
    List<SalesOrder> findByStatusesWithLines(@Param("statuses") List<SalesOrderStatus> statuses);
}
