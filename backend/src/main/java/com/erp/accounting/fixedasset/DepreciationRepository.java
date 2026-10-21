package com.erp.accounting.fixedasset;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface DepreciationRepository extends JpaRepository<Depreciation, Long> {

    boolean existsByAssetIdAndPeriod(Long assetId, String period);

    boolean existsByAssetId(Long assetId);

    /** 상각 취소 — 그 달의 행(분개 · 자산까지). */
    @Query("select d from Depreciation d join fetch d.asset left join fetch d.journalEntry where d.period = :period order by d.id")
    List<Depreciation> findByPeriodForCancel(@Param("period") String period);

    /** 그 자산을 상각한 달들(yyyy-MM). 빠진 달을 찾는 데 쓴다. */
    @Query("select d.period from Depreciation d where d.asset.id = :assetId")
    List<String> findPeriodsByAssetId(@Param("assetId") Long assetId);

    @Query("select d from Depreciation d join fetch d.asset a join fetch a.assetAccount " +
           "left join fetch d.journalEntry " +
           "where d.depreciationDate >= :from and d.depreciationDate <= :to " +
           "order by d.period desc, d.id desc")
    List<Depreciation> findAllWithRefs(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                                       @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);

    @Query("select d from Depreciation d join fetch d.asset a join fetch a.assetAccount " +
           "left join fetch d.journalEntry where d.period = :period order by d.id")
    List<Depreciation> findByPeriodWithRefs(String period);

    /** 그 자산의 귀속월(yyyy-MM)이 before 앞인 상각 합 — 정률법의 기초(회계연도 첫날) 장부가를 구한다. */
    @Query("select coalesce(sum(d.amount), 0) from Depreciation d where d.asset.id = :assetId and d.period < :before")
    java.math.BigDecimal sumBefore(@Param("assetId") Long assetId, @Param("before") String before);

    /** 감가상각계산 묶음이 만든 행(자산 · 자산계정까지). */
    @Query("select d from Depreciation d join fetch d.asset a join fetch a.assetAccount " +
           "left join fetch a.accumAccount left join fetch a.expenseAccount where d.calc.id = :calcId order by d.period, d.id")
    List<Depreciation> findByCalcId(@Param("calcId") Long calcId);
}
