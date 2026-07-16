package com.erp.groupware.dto;

import com.erp.groupware.domain.WorkPost;
import com.erp.groupware.domain.WorkPostStatus;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public final class WorkPostDtos {

    private WorkPostDtos() {}

    public record CreateWorkPostRequest(
            @NotBlank(message = "제목을 입력하세요.") String title,
            @NotBlank(message = "내용을 입력하세요.") String content,
            String forwardTo,
            LocalDate postDate
    ) {}

    public record UpdateWorkPostStatusRequest(
            WorkPostStatus status
    ) {}

    public record WorkPostResponse(
            Long id, int postNo, LocalDate postDate,
            String title, String content, String writer, String forwardTo,
            WorkPostStatus status, String statusName
    ) {
        public static WorkPostResponse from(WorkPost p) {
            return new WorkPostResponse(
                    p.getId(), p.getPostNo(), p.getPostDate(),
                    p.getTitle(), p.getContent(), p.getWriter(), p.getForwardTo(),
                    p.getStatus(), p.getStatus().getDisplayName());
        }
    }
}
