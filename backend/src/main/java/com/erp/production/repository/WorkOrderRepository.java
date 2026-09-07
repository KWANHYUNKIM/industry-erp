package com.erp.production.repository;

import com.erp.production.domain.WorkOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface WorkOrderRepository extends JpaRepository<WorkOrder, Long> {

    @Query("select w from WorkOrder w join fetch w.product join fetch w.warehouse " +
            "order by w.orderDate desc, w.id desc")
    List<WorkOrder> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select w from WorkOrder w join fetch w.product join fetch w.warehouse " +
            "where w.orderDate between :from and :to " +
            "order by w.orderDate desc, w.id desc")
    List<WorkOrder> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
