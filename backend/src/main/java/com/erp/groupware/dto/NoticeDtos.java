package com.erp.groupware.dto;

import com.erp.groupware.domain.Notice;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;

public final class NoticeDtos {

    private NoticeDtos() {}

    public record CreateNoticeRequest(
            @NotBlank(message = "제목을 입력하세요.") String title,
            String content,
            String category,
            Boolean pinned
    ) {}

    /** null 필드는 변경하지 않음. */
    public record UpdateNoticeRequest(
            String title,
            String content,
            String category,
            Boolean pinned
    ) {}

    public record NoticeResponse(
            Long id, String title, String content, String category,
            boolean pinned, int views, String author, LocalDateTime createdAt
    ) {
        public static NoticeResponse from(Notice n) {
            return new NoticeResponse(
                    n.getId(), n.getTitle(), n.getContent(), n.getCategory(),
                    n.isPinned(), n.getViews(), n.getAuthor(), n.getCreatedAt());
        }
    }
}
