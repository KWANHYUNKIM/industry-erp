package com.erp.dto;

import com.erp.domain.BoardPost;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;

public final class BoardDtos {

    private BoardDtos() {}

    public record CreatePostRequest(
            @NotBlank(message = "제목을 입력하세요.") String title,
            String content,
            String category
    ) {}

    /** 목록용 요약 (본문 제외). */
    public record PostSummary(
            Long id,
            String title,
            String category,
            String author,
            int views,
            LocalDateTime createdAt
    ) {
        public static PostSummary from(BoardPost p) {
            return new PostSummary(p.getId(), p.getTitle(), p.getCategory(),
                    p.getAuthor(), p.getViews(), p.getCreatedAt());
        }
    }

    /** 상세 (본문 포함). */
    public record PostDetail(
            Long id,
            String title,
            String content,
            String category,
            String author,
            int views,
            LocalDateTime createdAt
    ) {
        public static PostDetail from(BoardPost p) {
            return new PostDetail(p.getId(), p.getTitle(), p.getContent(), p.getCategory(),
                    p.getAuthor(), p.getViews(), p.getCreatedAt());
        }
    }
}
