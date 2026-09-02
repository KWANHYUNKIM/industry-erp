package com.erp.accounting.repository;

import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.domain.JournalSourceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

    boolean existsBySourceTypeAndSourceId(JournalSourceType sourceType, Long sourceId);

    Optional<JournalEntry> findBySourceTypeAndSourceId(JournalSourceType sourceType, Long sourceId);

    /** 여러 전표의 분개를 한 번에. 줄마다 찾으면 N+1 이다. */
    List<JournalEntry> findBySourceTypeAndSourceIdIn(JournalSourceType sourceType, List<Long> sourceIds);

    /**
     * 전표조회: 라인과 계정까지 한 번에 가져온다.
     * 라인을 fetch join 하지 않으면 응답을 만들면서 전표마다 라인을, 라인마다 계정을 다시 조회한다(N+1).
     */
    @Query("select distinct e from JournalEntry e " +
            "left join fetch e.partner " +
            "left join fetch e.lines l " +
            "left join fetch l.account " +
            "where e.entryDate between :from and :to " +
            "order by e.entryDate desc, e.id desc")
    List<JournalEntry> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 같은 조건의 <b>줄 수</b>. 다 꺼내 놓고 세면 이미 늦다. */
    @Query("select count(e) from JournalEntry e where e.entryDate between :from and :to")
    long countByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /**
     * 같은 차례로 <b>id 만</b> 앞에서 몇 개 꺼낸다.
     *
     * <p>위 {@code findByPeriod} 는 {@code join fetch e.lines} 라 그대로 페이징하면
     * 하이버네이트가 <b>전부 읽어 메모리에서</b> 자른다 — 자르는 뜻이 없어진다.
     * 그래서 붙이지 않은 질의로 id 를 먼저 자르고, 그 id 들만 아래에서 실어 온다.
     */
    @Query("select e.id from JournalEntry e where e.entryDate between :from and :to "
            + "order by e.entryDate desc, e.id desc")
    List<Long> findIdsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to,
                               org.springframework.data.domain.Pageable pageable);

    /** 위에서 고른 id 들을 줄까지 붙여 같은 차례로 실어 온다. */
    @Query("select distinct e from JournalEntry e "
            + "left join fetch e.partner "
            + "left join fetch e.lines l "
            + "left join fetch l.account "
            + "where e.id in :ids "
            + "order by e.entryDate desc, e.id desc")
    List<JournalEntry> findByIdsWithLines(@Param("ids") List<Long> ids);

}
