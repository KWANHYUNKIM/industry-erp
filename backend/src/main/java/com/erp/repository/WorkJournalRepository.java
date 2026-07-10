package com.erp.repository;

import com.erp.domain.WorkJournal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WorkJournalRepository extends JpaRepository<WorkJournal, Long> {

    @Query("select j from WorkJournal j join fetch j.author " +
            "order by j.reportDate desc, j.id desc")
    List<WorkJournal> findAllWithRefs();
}
