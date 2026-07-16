package com.erp.groupware.repository;

import com.erp.groupware.domain.BoardPost;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoardRepository extends JpaRepository<BoardPost, Long> {
}
