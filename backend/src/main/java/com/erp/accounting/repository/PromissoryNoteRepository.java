package com.erp.accounting.repository;

import com.erp.accounting.domain.PromissoryNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PromissoryNoteRepository extends JpaRepository<PromissoryNote, Long> {

    @Query("select n from PromissoryNote n join fetch n.partner order by n.dueDate asc, n.id desc")
    List<PromissoryNote> findAllWithPartner();
}
