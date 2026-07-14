package com.erp.repository;

import com.erp.domain.FixedAsset;
import com.erp.domain.enums.AssetStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface FixedAssetRepository extends JpaRepository<FixedAsset, Long> {

    @Query("select a from FixedAsset a join fetch a.assetAccount order by a.acquisitionDate desc, a.id desc")
    List<FixedAsset> findAllWithAccount();

    @Query("select a from FixedAsset a join fetch a.assetAccount where a.status = :status order by a.id")
    List<FixedAsset> findByStatusWithAccount(AssetStatus status);
}
