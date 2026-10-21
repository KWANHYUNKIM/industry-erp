package com.erp.auth.user;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PasswordHistoryRepository extends JpaRepository<PasswordHistory, Long> {
    /** 최근 것부터. Pageable 로 N개만. */
    List<PasswordHistory> findByUser_IdOrderByIdDesc(Long userId, Pageable page);
}
