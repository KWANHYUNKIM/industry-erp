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

}
