package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 업무게시판(WORK) 게시글. 업무 요청·공유를 게시하고 진행상태를 관리한다.
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
