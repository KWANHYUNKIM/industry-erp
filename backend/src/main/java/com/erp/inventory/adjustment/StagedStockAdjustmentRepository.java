package com.erp.inventory.adjustment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface StagedStockAdjustmentRepository extends JpaRepository<StagedStockAdjustment, Long> {

    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse left join fetch s.adjustment " +
            "order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse left join fetch s.adjustment " +
            "where s.requestDate between :from and :to " +
            "order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse left join fetch s.adjustment " +
            "where s.status = :status order by s.requestDate desc, s.id desc")
    List<StagedStockAdjustment> findByStatusWithRefs(@Param("status") StagedStatus status);

    /** 실사 전표 한 장의 줄들 — 줄 차례(id)대로. */
    @Query("select s from StagedStockAdjustment s join fetch s.item join fetch s.warehouse left join fetch s.adjustment " +
            "where s.slipNo = :slipNo order by s.id")
    List<StagedStockAdjustment> findSlip(@Param("slipNo") String slipNo);

    /** 이 재고조정으로 맞춘 실사 줄들 — 조정을 지우면 조정 전으로 돌린다(StockAdjustmentService.delete). */
    List<StagedStockAdjustment> findByAdjustment_Id(Long adjustmentId);
}
