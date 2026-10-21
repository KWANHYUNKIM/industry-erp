package com.erp.accounting.fixedasset;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface FixedAssetMovementRepository extends JpaRepository<FixedAssetMovement, Long> {

    @Query("select m from FixedAssetMovement m left join fetch m.journalEntry left join fetch m.account " +
           "where m.asset.id in :ids order by m.slipDate, m.id")
    List<FixedAssetMovement> findByAssetIds(@Param("ids") Collection<Long> ids);

    @Query("select m from FixedAssetMovement m left join fetch m.journalEntry where m.asset.id = :assetId order by m.slipDate, m.id")
    List<FixedAssetMovement> findByAssetId(@Param("assetId") Long assetId);

    @Query("select m from FixedAssetMovement m join fetch m.asset where m.journalEntry.id = :entryId")
    Optional<FixedAssetMovement> findByJournalEntryId(@Param("entryId") Long entryId);
}
