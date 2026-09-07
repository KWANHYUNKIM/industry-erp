package com.erp.accounting.repository;

import com.erp.accounting.domain.FixedAsset;
import com.erp.accounting.domain.enums.AssetStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface FixedAssetRepository extends JpaRepository<FixedAsset, Long> {

    @Query("select a from FixedAsset a join fetch a.assetAccount " +
           "where a.acquisitionDate >= :from and a.acquisitionDate <= :to " +
           "order by a.acquisitionDate desc, a.id desc")
    List<FixedAsset> findAllWithAccount(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                                        @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);

    @Query("select a from FixedAsset a join fetch a.assetAccount where a.status = :status order by a.id")
    List<FixedAsset> findByStatusWithAccount(AssetStatus status);
}
