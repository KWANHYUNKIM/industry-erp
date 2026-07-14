package com.erp.repository;

import com.erp.domain.UserNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserNoteRepository extends JpaRepository<UserNote, Long> {

    /** 고정된 메모가 위, 그다음 최근 수정순 */
    List<UserNote> findByOwner_UsernameOrderByPinnedDescUpdatedAtDesc(String username);

    Optional<UserNote> findByIdAndOwner_Username(Long id, String username);
}
