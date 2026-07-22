package com.erp.inventory.repository;

import com.erp.inventory.domain.StagedStockAdjustment;
import com.erp.inventory.domain.enums.StagedStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StagedStockAdjustmentRepository extends JpaRepository<StagedStockAdjustment, Long> {

    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse " +
            "order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findAllWithRefs();

    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse " +
            "where s.status = :status order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findByStatusWithRefs(@Param("status") StagedStatus status);
}
