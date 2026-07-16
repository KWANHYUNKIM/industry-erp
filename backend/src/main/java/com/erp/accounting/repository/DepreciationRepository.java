package com.erp.accounting.repository;

import com.erp.accounting.domain.Depreciation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DepreciationRepository extends JpaRepository<Depreciation, Long> {

    boolean existsByAssetIdAndPeriod(Long assetId, String period);

    @Query("select d from Depreciation d join fetch d.asset a join fetch a.assetAccount " +
           "left join fetch d.journalEntry order by d.period desc, d.id desc")
    List<Depreciation> findAllWithRefs();

    @Query("select d from Depreciation d join fetch d.asset a join fetch a.assetAccount " +
           "left join fetch d.journalEntry where d.period = :period order by d.id")
    List<Depreciation> findByPeriodWithRefs(String period);
}
