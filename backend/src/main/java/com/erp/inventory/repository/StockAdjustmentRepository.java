package com.erp.inventory.repository;

import com.erp.inventory.domain.StockAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, Long> {

    /** 목록 조회 (품목/창고 함께 로딩 — N+1 방지) */
    @Query("select a from StockAdjustment a join fetch a.item join fetch a.warehouse " +
           "order by a.adjustDate desc, a.id desc")
    List<StockAdjustment> findAllWithRefs();

    /**
     * 기간으로 걸러 조회. 날짜를 안 주면 그 쪽 끝은 열어 둔다.
     *
     * <p>예전에는 기간 조건이 <b>아예 없었다.</b> 화면은 [금월] 을 물어 놓고 전체를 받아
     * 브라우저에서 걸렀다 — 4,797줄·1.7MB 를 열 때마다 내려보내고 그중 몇십 줄만 그렸다.
     */
    /*
     * <b>널을 파라미터로 넘기지 않는다.</b> <code>:from is null</code> 로 쓰면 PostgreSQL 이
     * 그 자리의 형을 정하지 못해 <code>could not determine data type of parameter $1</code>
     * 로 터진다. 안 준 쪽은 서비스가 열린 끝(0001-01-01 / 9999-12-31)으로 채워 준다.
     */
    @Query("select a from StockAdjustment a join fetch a.item join fetch a.warehouse "
           + "where a.adjustDate between :from and :to "
           + "order by a.adjustDate desc, a.id desc")
    List<StockAdjustment> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to,
                                       Pageable pageable);

    @Query("select count(a) from StockAdjustment a where a.adjustDate between :from and :to")
    long countByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
