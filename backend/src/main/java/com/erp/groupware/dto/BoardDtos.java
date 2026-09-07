package com.erp.groupware.dto;

import jakarta.validation.constraints.Size;
import com.erp.groupware.domain.BoardPost;

import java.time.LocalDateTime;

public final class BoardDtos {

    private BoardDtos() {}

    /** 익명 글의 작성자는 응답에서 이 이름으로 나간다. */
    private static final String ANONYMOUS = "익명";

    /**
     * 응답에 실을 작성자. 익명 글이면 가린다.
     * 본인에게도 가린다 — '나만 이름이 보인다'는 화면은 익명 글을 쓴 사람에게 착각을 준다
     * (남에게도 보이는 줄 알거나, 반대로 서버에 안 남는 줄 알거나).
     */
    private static String authorOf(BoardPost p) {
        return p.isAnonymous() ? ANONYMOUS : p.getAuthor();
    }

    /**
     * 제목은 없어도 된다. 원본 익명게시판(E070252)은 제목 칸 없이 글상자 하나에 쓰고 [저장(F8)]
     * 을 누르는 화면이라, 제목을 강제하면 그 화면을 만들 수가 없다. 비우면 본문 첫 줄을 제목으로 쓴다.
     */
    public record CreatePostRequest(
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String title,
            String content,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String category,
            /** 익명으로 올릴지. 작성자는 서버에 남지만 응답에서는 가려진다. */
            Boolean anonymous
    ) {}

    /**
     * 목록용 요약.
     *
     * <p>본문도 같이 보낸다. 익명게시판(E070252)은 제목 없이 한마디 남기는 벽이라
     * 목록이 곧 본문이고, 첫 줄만 보여주면 나머지를 볼 방법이 없다. 글이 짧아 문제되지 않는다.
     */
    public record PostSummary(
            Long id,
            String title,
            String content,
            String category,
            String author,
            boolean anonymous,
            int views,
            LocalDateTime createdAt
    ) {
        public static PostSummary from(BoardPost p) {
            return new PostSummary(p.getId(), p.getTitle(), p.getContent(), p.getCategory(),
                    authorOf(p), p.isAnonymous(), p.getViews(), p.getCreatedAt());
        }
    }

    /** 상세 (본문 포함). */
    public record PostDetail(
            Long id,
            String title,
            String content,
            String category,
            String author,
            boolean anonymous,
            int views,
            LocalDateTime createdAt
    ) {
        public static PostDetail from(BoardPost p) {
            return new PostDetail(p.getId(), p.getTitle(), p.getContent(), p.getCategory(),
                    authorOf(p), p.isAnonymous(), p.getViews(), p.getCreatedAt());
        }
    }
}
