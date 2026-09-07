package com.erp.trade.repository;

import com.erp.trade.domain.Shipment;
import com.erp.trade.domain.ShipmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ShipmentRepository extends JpaRepository<Shipment, Long> {

    @Query("select distinct s from Shipment s " +
            "join fetch s.partner " +
            "left join fetch s.salesOrder " +
            "join fetch s.lines l join fetch l.item " +
            "order by s.shipDate desc, s.id desc")
    List<Shipment> findAllWithLines();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select distinct s from Shipment s " +
            "join fetch s.partner " +
            "left join fetch s.salesOrder " +
            "join fetch s.lines l join fetch l.item " +
            "where s.shipDate between :from and :to " +
            "order by s.shipDate desc, s.id desc")
    List<Shipment> findWithLinesByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select distinct s from Shipment s " +
            "join fetch s.partner " +
            "left join fetch s.salesOrder " +
            "join fetch s.lines l join fetch l.item " +
            "where s.status = :status " +
            "order by s.shipDate desc, s.id desc")
    List<Shipment> findByStatusWithLines(@Param("status") ShipmentStatus status);

    /** 이 수주에서 만든 출하가 있나. 수주 삭제 가능 여부를 본다. */
    boolean existsBySalesOrderId(Long salesOrderId);
}
