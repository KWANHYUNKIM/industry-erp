package com.erp.accounting.promissorynote;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PromissoryNoteRepository extends JpaRepository<PromissoryNote, Long> {

    boolean existsByNoteNo(String noteNo);

    java.util.Optional<PromissoryNote> findByNoteNo(String noteNo);

    /** 이 회계전표로 닫힌 어음 — 입금보고서 · 지출결의서 수정 때 떼었다가 새 전표에 다시 건다. */
    List<PromissoryNote> findByCloseJournalEntryId(Long journalEntryId);

    @Query("select n from PromissoryNote n join fetch n.partner left join fetch n.closePartner left join fetch n.closeJournalEntry " +
           "where n.issueDate >= :from and n.issueDate <= :to " +
           "order by n.dueDate asc, n.id desc")
    List<PromissoryNote> findAllWithPartner(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                                            @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);
}
