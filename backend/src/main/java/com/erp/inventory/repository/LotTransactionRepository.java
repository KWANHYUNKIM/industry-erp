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
            "left join fetch l.warehouse " +
            "order by l.lotNo asc, t.txDate asc, t.id asc")
    List<LotTransaction> findAllWithRefs();

    /*
     * 화면 조건 판의 <b>[기준일자]</b>(2026-09-01 원본 E040620 실측: 기본 [전월+금월]).
     * 예전에는 물어보지도 않고 여태 쌓인 움직임을 통째로 주었다.
     * 안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 로 쓰면
     * PostgreSQL 이 파라미터 타입을 못 정해 42P18 로 터진다.
     */
    @Query("select t from LotTransaction t join fetch t.lot l join fetch l.item " +
            "left join fetch l.warehouse " +
            "where t.txDate between :from and :to " +
            "order by l.lotNo asc, t.txDate asc, t.id asc")
    List<LotTransaction> findByPeriodWithRefs(@Param("from") java.time.LocalDate from,
                                              @Param("to") java.time.LocalDate to);

    /**
     * 그 날 <b>뒤에</b> 일어난 로트별 움직임 합. 기준일자 시점의 로트 잔량은
     * <b>지금 잔량 − 그 뒤의 움직임</b>이다(품목 재고를 asOf 로 되돌리는 방식과 같다).
     */
    @Query("select t.lot.id, coalesce(sum(t.quantityChange), 0) from LotTransaction t " +
            "where t.txDate > :date group by t.lot.id")
    List<Object[]> sumChangeAfter(@Param("date") LocalDate date);
}
