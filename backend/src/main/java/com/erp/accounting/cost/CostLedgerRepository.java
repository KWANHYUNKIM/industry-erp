package com.erp.accounting.cost;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CostLedgerRepository extends JpaRepository<CostLedger, Long> {

    /** 원가계산내역 — 한 기간의 줄을 품목코드 차례로(원본도 품목코드 차례). */
    @Query("select l from CostLedger l join fetch l.item where l.period.id = :periodId order by l.item.code")
    List<CostLedger> findByPeriodWithItem(@Param("periodId") Long periodId);

    Optional<CostLedger> findByPeriod_IdAndItem_Id(Long periodId, Long itemId);

    @Modifying
    @Query("delete from CostLedger l where l.period.id = :periodId")
    int deleteByPeriodId(@Param("periodId") Long periodId);
}
