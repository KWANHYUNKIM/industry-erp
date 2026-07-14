package com.erp.dto;

import com.erp.domain.BoardPost;
import jakarta.validation.constraints.NotBlank;

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

    public record CreatePostRequest(
            @NotBlank(message = "제목을 입력하세요.") String title,
            String content,
            String category,
            /** 익명으로 올릴지. 작성자는 서버에 남지만 응답에서는 가려진다. */
            Boolean anonymous
    ) {}

    /** 목록용 요약 (본문 제외). */
    public record PostSummary(
            Long id,
            String title,
            String category,
            String author,
            boolean anonymous,
            int views,
            LocalDateTime createdAt
    ) {
        public static PostSummary from(BoardPost p) {
            return new PostSummary(p.getId(), p.getTitle(), p.getCategory(),
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
