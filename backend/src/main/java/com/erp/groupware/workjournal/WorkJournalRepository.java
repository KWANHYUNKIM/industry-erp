package com.erp.groupware.workjournal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.time.LocalDate;

public interface WorkJournalRepository extends JpaRepository<WorkJournal, Long> {

    @Query("select j from WorkJournal j join fetch j.author " +
            "left join fetch j.partner left join fetch j.project left join fetch j.attachment " +
            "order by j.reportDate desc, j.id desc")
    List<WorkJournal> findAllWithRefs();

    /** 기간으로 걸러 온다. 안 준 쪽은 서비스가 열린 끝으로 채운다. */
    @Query("select j from WorkJournal j join fetch j.author left join fetch j.attachment "
            + "where j.reportDate between :from and :to "
            + "order by j.reportDate desc, j.id desc")
    List<WorkJournal> findWithRefsByPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    /** 답글이 달렸나 — 원본은 답글이 있는 글을 지우지 못하게 막는다. */
    boolean existsByParentId(Long parentId);
}
