package com.erp.common.history;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

import java.util.List;

public interface ChangeHistoryRepository extends JpaRepository<ChangeHistory, Long> {

    List<ChangeHistory> findByTargetAndTargetIdOrderByWorkedAtAscIdAsc(String target, Long targetId);

    /** 전표 이력(menu 가 있는 줄)만 — 작업일시 [from, to). */
    @Query("select h from ChangeHistory h where h.menu is not null and h.workedAt >= :from and h.workedAt < :to")
    List<ChangeHistory> findSlips(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
