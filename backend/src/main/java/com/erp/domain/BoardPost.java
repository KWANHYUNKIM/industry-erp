package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

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
}
