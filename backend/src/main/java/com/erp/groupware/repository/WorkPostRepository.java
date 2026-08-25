package com.erp.groupware.repository;

import com.erp.groupware.domain.WorkPost;
import com.erp.groupware.domain.enums.PostBoard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WorkPostRepository extends JpaRepository<WorkPost, Long> {

    /** 게시글번호는 게시판을 가로질러 한 줄기다 — 원본이 그래서 목록 번호에 구멍이 보인다. */
    @Query("select coalesce(max(p.postNo), 0) from WorkPost p")
    int maxPostNo();

    @Query("select p from WorkPost p where p.board = :board order by p.postDate desc, p.id desc")
    List<WorkPost> findByBoardOrdered(@Param("board") PostBoard board);
}
