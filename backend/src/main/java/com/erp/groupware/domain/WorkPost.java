package com.erp.groupware.domain;

import com.erp.groupware.domain.enums.PostBoard;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 게시글. 게시판({@link PostBoard})마다 목록이 갈리지만 테이블과 게시글번호는 하나로 이어진다.
 * 업무관리 &gt; WORK 게시판과 공유정보 &gt; 공지사항이 같은 모양이라 화면도 한 컴포넌트를 쓴다.
 */
@Entity
@Table(name = "work_posts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkPost extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 게시글번호(등록순 정수) */
    /**
     * 게시판. 게시글번호는 <b>게시판을 가로질러 한 줄기</b>다 — 원본이 그렇다.
     * 그래서 공지사항 목록의 번호에 구멍이 보인다(그 번호는 다른 게시판 글이다).
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PostBoard board = PostBoard.WORK;

    @Column(nullable = false)
    private int postNo;

    @Column(nullable = false)
    private LocalDate postDate;

    @Column(nullable = false, length = 200)
    private String title;

    // @Lob 은 PostgreSQL 에서 oid(large object)로 매핑된다. V15 에서 text 로 옮겼다.
    @Column(nullable = false, columnDefinition = "text")
    private String content;

    /** 작성자 */
    @Column(nullable = false, length = 50)
    private String writer;

    /** 전달자(공유 대상, 자유입력) */
    @Column(length = 200)
    private String forwardTo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private WorkPostStatus status = WorkPostStatus.IN_PROGRESS;
}
