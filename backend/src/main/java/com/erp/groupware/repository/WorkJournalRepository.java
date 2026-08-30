package com.erp.groupware.repository;

import com.erp.groupware.domain.WorkJournal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.time.LocalDate;

public interface WorkJournalRepository extends JpaRepository<WorkJournal, Long> {

    @Query("select j from WorkJournal j join fetch j.author " +
            "left join fetch j.partner left join fetch j.project " +
            "order by j.reportDate desc, j.id desc")
    List<WorkJournal> findAllWithRefs();

    /** 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채운다. */
    @Query("select j from WorkJournal j join fetch j.author "
            + "where j.reportDate between :from and :to "
            + "order by j.reportDate desc, j.id desc")
    List<WorkJournal> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
