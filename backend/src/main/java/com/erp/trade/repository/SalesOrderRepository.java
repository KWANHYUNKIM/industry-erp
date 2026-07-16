package com.erp.trade.repository;

import com.erp.trade.domain.SalesOrder;
import com.erp.trade.domain.SalesOrderStatus;
import org.springframework.data.domain.Pageable;
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

    /** 통합검색: 수주번호·거래처명 부분일치 상위 N건 */
    @Query("select o from SalesOrder o join fetch o.partner p " +
           "where lower(o.orderNo) like :q or lower(p.name) like :q " +
           "order by o.orderDate desc, o.id desc")
    List<SalesOrder> searchTop(@Param("q") String q, Pageable pageable);

    @Query("select count(o) from SalesOrder o where lower(o.orderNo) like :q or lower(o.partner.name) like :q")
    long searchCount(@Param("q") String q);

}
