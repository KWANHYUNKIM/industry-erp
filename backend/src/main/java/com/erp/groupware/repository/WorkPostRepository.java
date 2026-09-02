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

    /**
     * 원본 [공지사항여부] 가 켜진 글은 <b>맨 위에 붙는다.</b> 켜 놓고 날짜순으로 밀리면
     * 공지가 아니다. 공지끼리는 다시 최신순이다.
     */
    @Query("select p from WorkPost p where p.board = :board "
            + "order by p.notice desc, p.postDate desc, p.id desc")
    List<WorkPost> findByBoardOrdered(@Param("board") PostBoard board);
}
