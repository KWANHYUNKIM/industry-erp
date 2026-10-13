package com.erp.groupware.multislip;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface MultiSlipRepository extends JpaRepository<MultiSlip, Long> {

    /** 목록 — 새 전표가 위(원본 저장하면 목록 맨 위에 새 줄). 줄을 같이 가져온다(N+1 막기). */
    @Query("select distinct s from MultiSlip s left join fetch s.lines where s.board = :board "
            + "order by s.slipDate desc, s.slipNo desc")
    List<MultiSlip> findByBoardWithLines(@Param("board") MultiSlipBoard board);

    @Query("select coalesce(max(s.slipNo), 0) from MultiSlip s where s.board = :board and s.slipDate = :date")
    int maxSlipNo(@Param("board") MultiSlipBoard board, @Param("date") LocalDate date);
}
