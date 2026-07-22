package com.erp.inventory.repository;

import com.erp.inventory.domain.LotTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface LotTransactionRepository extends JpaRepository<LotTransaction, Long> {

    /** 로트 수불부/내역 — 로트·품목 함께 로딩, 로트별로 시간순(오름차순)으로 읽도록 정렬. */
    @Query("select t from LotTransaction t join fetch t.lot l join fetch l.item " +
            "order by l.lotNo asc, t.txDate asc, t.id asc")
    List<LotTransaction> findAllWithRefs();
}
