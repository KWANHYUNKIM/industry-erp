package com.erp.trade.repository;

import com.erp.trade.domain.Shipment;
import com.erp.trade.domain.ShipmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ShipmentRepository extends JpaRepository<Shipment, Long> {

    @Query("select distinct s from Shipment s " +
            "join fetch s.partner " +
            "left join fetch s.salesOrder " +
            "join fetch s.lines l join fetch l.item " +
            "order by s.shipDate desc, s.id desc")
    List<Shipment> findAllWithLines();

    @Query("select distinct s from Shipment s " +
            "join fetch s.partner " +
            "left join fetch s.salesOrder " +
            "join fetch s.lines l join fetch l.item " +
            "where s.status = :status " +
            "order by s.shipDate desc, s.id desc")
    List<Shipment> findByStatusWithLines(@Param("status") ShipmentStatus status);
}
