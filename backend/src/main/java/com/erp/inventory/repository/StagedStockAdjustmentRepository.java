package com.erp.inventory.repository;

import com.erp.inventory.domain.StagedStockAdjustment;
import com.erp.inventory.domain.enums.StagedStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface StagedStockAdjustmentRepository extends JpaRepository<StagedStockAdjustment, Long> {

    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse " +
            "order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse " +
            "where s.requestDate between :from and :to " +
            "order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse " +
            "where s.status = :status order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findByStatusWithRefs(@Param("status") StagedStatus status);
}
