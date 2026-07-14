package com.erp.repository;

import com.erp.domain.JournalEntry;
import com.erp.domain.JournalSourceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

    boolean existsBySourceTypeAndSourceId(JournalSourceType sourceType, Long sourceId);

    Optional<JournalEntry> findBySourceTypeAndSourceId(JournalSourceType sourceType, Long sourceId);

    @Query("select distinct e from JournalEntry e left join fetch e.partner " +
            "where e.entryDate between :from and :to " +
            "order by e.entryDate desc, e.id desc")
    List<JournalEntry> findByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

}
