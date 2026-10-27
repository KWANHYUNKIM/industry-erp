package com.erp.groupware.workjournal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WorkJournalViewRepository extends JpaRepository<WorkJournalView, Long> {

    Optional<WorkJournalView> findByJournalIdAndUsername(Long journalId, String username);

    List<WorkJournalView> findByJournalIdOrderByFirstViewedAtAsc(Long journalId);
}
