package com.erp.inventory.repository;

import com.erp.inventory.domain.LotTransaction;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface LotTransactionRepository extends JpaRepository<LotTransaction, Long> {

    /** 로트 수불부/내역 — 로트·품목 함께 로딩, 로트별로 시간순(오름차순)으로 읽도록 정렬. */
    @Query("select t from LotTransaction t join fetch t.lot l join fetch l.item " +
            "order by l.lotNo asc, t.txDate asc, t.id asc")
    List<LotTransaction> findAllWithRefs();

    /**
     * 그 날 <b>뒤에</b> 일어난 로트별 움직임 합. 기준일자 시점의 로트 잔량은
     * <b>지금 잔량 − 그 뒤의 움직임</b>이다(품목 재고를 asOf 로 되돌리는 방식과 같다).
     */
    @Query("select t.lot.id, coalesce(sum(t.quantityChange), 0) from LotTransaction t " +
            "where t.txDate > :date group by t.lot.id")
    List<Object[]> sumChangeAfter(@Param("date") LocalDate date);
}
