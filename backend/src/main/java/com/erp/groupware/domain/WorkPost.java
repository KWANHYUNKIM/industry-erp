package com.erp.groupware.domain;

import com.erp.groupware.domain.enums.PostBoard;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.common.StoredFile;

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

    /**
     * 원본 WORK입력 폼의 <b>[참조자]</b>. 전달자와 나란히 있는 칸이다.
     * 원본은 사원 코드도움이지만 우리 전달자와 같은 자유입력으로 둔다 — 한쪽만 코드로 바꾸면
     * 같은 줄에 성격이 다른 두 칸이 생긴다.
     */
    @Column(name = "cc_to", length = 200)
    private String ccTo;

    /**
     * 원본 WORK입력 폼의 <b>[공지사항여부]</b> 체크박스.
     * 켜면 목록 맨 위에 붙는다 — 그게 이 칸이 있는 이유다. 켜 놓고 날짜순으로 밀리면
     * 공지가 아니다.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean notice = false;

    /**
     * 원본 WORK입력 폼의 <b>[완료일시]</b>. 피커가 년/월/일 + 시:분이라 날짜가 아니라 일시다.
     *
     * <p>진행상태를 완료로 바꿀 때 자동으로 찍고, 진행중으로 되돌리면 지운다 —
     * '진행중인데 완료일시가 남아 있는' 줄을 만들지 않기 위해서다.
     */
    @Column(name = "completed_at")
    private java.time.LocalDateTime completedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private WorkPostStatus status = WorkPostStatus.IN_PROGRESS;

    /**
     * 첨부 한 건. 원본 WORK 격자의 <b>[첨부]</b> 열이고, 상세를 펼치면 이름·크기가 붙는다.
     * 우리 화면에는 열만 있고 늘 비어 있었다 — 붙일 자리가 없었기 때문이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attachment_id")
    private StoredFile attachment;

    /**
     * 원본 격자의 <b>[조회]</b> 열. 우리는 그 자리에 완료/재개 버튼을 넣어 두어
     * 열 이름과 내용이 어긋나 있었다.
     */
    @Column(name = "view_count", nullable = false)
    @Builder.Default
    private int viewCount = 0;
}
