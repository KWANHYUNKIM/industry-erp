package com.erp.accounting.fixedasset;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface DepreciationRepository extends JpaRepository<Depreciation, Long> {

    boolean existsByAssetIdAndPeriod(Long assetId, String period);

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
}
