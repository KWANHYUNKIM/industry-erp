package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 업무관리 게시판 글. (그룹웨어 &gt; 업무관리게시판)
 */
@Entity
@Table(name = "board_posts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardPost extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 제목 */
    @Column(nullable = false, length = 200)
    private String title;

    /** 본문 */
    @Column(columnDefinition = "text")
    private String content;

    /** 분류 (공지/자유/자료 등) */
    @Column(length = 30)
    private String category;

    /** 작성자 (로그인 사용자명) */
    @Column(length = 50)
    private String author;

    /** 조회수 */
    @Column(nullable = false)
    @Builder.Default
    private int views = 0;

    /**
     * 익명글 여부. 익명이어도 작성자는 DB 에 남는다 — 본인 확인 없이 삭제를 허용할 수 없고,
     * 문제가 생기면 추적할 수 있어야 한다. 가리는 것은 API 응답이다.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean anonymous = false;
}
