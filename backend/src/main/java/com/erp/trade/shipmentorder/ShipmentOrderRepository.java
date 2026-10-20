package com.erp.trade.shipmentorder;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ShipmentOrderRepository extends JpaRepository<ShipmentOrder, Long> {

    /** 목록 — 원본 정렬 일자 내림차순. 줄은 화면이 품목명(요약)을 만들 때 쓴다. */
    @Query("select distinct o from ShipmentOrder o join fetch o.partner " +
            "left join fetch o.warehouse left join fetch o.employee left join fetch o.project " +
            "left join fetch o.lines l left join fetch l.item " +
            "where o.orderDate between :from and :to order by o.orderDate desc, o.id desc")
    List<ShipmentOrder> findWithLinesByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select o from ShipmentOrder o join fetch o.partner " +
            "left join fetch o.warehouse left join fetch o.employee left join fetch o.project " +
            "left join fetch o.lines l left join fetch l.item where o.id = :id")
    Optional<ShipmentOrder> findWithLines(@Param("id") Long id);

    /** 미출하현황 — 진행중 지시서의 줄. */
    @Query("select l from ShipmentOrderLine l join fetch l.shipmentOrder o join fetch o.partner " +
            "left join fetch o.warehouse join fetch l.item " +
            "where o.status = com.erp.trade.shipmentorder.ShipmentOrderStatus.IN_PROGRESS " +
            "order by o.orderDate, o.id, l.id")
    List<ShipmentOrderLine> findOpenLines();
}
