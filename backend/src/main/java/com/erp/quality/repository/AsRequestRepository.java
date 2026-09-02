package com.erp.quality.repository;

import com.erp.quality.domain.AsRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface AsRequestRepository extends JpaRepository<AsRequest, Long> {

    @Query("select a from AsRequest a join fetch a.partner join fetch a.item " +
            "order by a.receiptDate desc, a.id desc")
    List<AsRequest> findAllWithRefs();

    /**
     * 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채워 준다 —
     * <code>:from is null</code> 로 쓰면 PostgreSQL 이 그 자리의 형을 못 정해 터진다.
     */
    @Query("select a from AsRequest a join fetch a.partner join fetch a.item " +
            "where a.receiptDate between :from and :to " +
            "order by a.receiptDate desc, a.id desc")
    List<AsRequest> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /*
     * 원본 <b>A/S수리현황(E040611)</b> 의 주 조건 [기준일자]는 <b>수리한 날</b>이고
     * [접수일자]가 보조다(2026-09-01 실측). 우리는 접수일로만 기간을 받아 차례가 반대였고,
     * 이번 달에 <b>고친</b> 건을 서버에서 좁힐 수가 없었다 — 접수는 지난달인데 수리가
     * 이번 달인 건이 통째로 빠진다.
     *
     * <p>안 고친 건은 그 날이 없으니 <b>빠지는 것이 맞다</b>(done_date is null).
     */
    @Query("select a from AsRequest a join fetch a.partner join fetch a.item " +
            "where a.doneDate between :from and :to " +
            "order by a.doneDate desc, a.id desc")
    List<AsRequest> findWithRefsByDonePeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
