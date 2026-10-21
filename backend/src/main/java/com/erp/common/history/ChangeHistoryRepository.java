package com.erp.common.history;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

import java.util.List;

public interface ChangeHistoryRepository extends JpaRepository<ChangeHistory, Long> {

    List<ChangeHistory> findByTargetAndTargetIdOrderByWorkedAtAscIdAsc(String target, Long targetId);

    /** 같은 대상 종류 · 전표번호로 맨 처음 적은 줄 — 줄을 지웠다 다시 쓰는 전표(행 id 가 바뀜)의 이력 열쇠를 이어 가는 데 쓴다. */
    java.util.Optional<ChangeHistory> findFirstByTargetAndDocNoOrderByIdAsc(String target, String docNo);

    /** 전표 이력(menu 가 있는 줄)만 — 작업일시 [from, to). */
    @Query("select h from ChangeHistory h where h.menu is not null and h.workedAt >= :from and h.workedAt < :to")
    List<ChangeHistory> findSlips(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** 기초코드(품목 · 거래처 · BOM) 이력 — 전표 칸(menu)이 없는 줄 중 대상 종류가 targets 인 것, 작업일시 [from, to). */
    @Query("select h from ChangeHistory h where h.menu is null and h.target in :targets and h.workedAt >= :from and h.workedAt < :to")
    List<ChangeHistory> findMasters(@Param("targets") java.util.Collection<String> targets,
                                    @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
