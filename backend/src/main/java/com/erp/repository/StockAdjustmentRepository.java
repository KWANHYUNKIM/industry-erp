package com.erp.repository;

import com.erp.domain.StockAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, Long> {

    /** 목록 조회 (품목/창고 함께 로딩 — N+1 방지) */
    @Query("select a from StockAdjustment a join fetch a.item join fetch a.warehouse " +
           "order by a.adjustDate desc, a.id desc")
    List<StockAdjustment> findAllWithRefs();
}
