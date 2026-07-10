package com.erp.repository;

import com.erp.domain.BoardPost;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BoardRepository extends JpaRepository<BoardPost, Long> {
}
