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
            String title, String content,
            /** 작성자 로그인 아이디 (users.username FK) */
            String writer,
            /** 작성자 표시 이름. 화면은 이걸 보여 준다 — writer 는 아이디라 사람이 읽기 나쁘다. */
            String writerName,
            String forwardTo,
            WorkPostStatus status, String statusName
    ) {
        public static WorkPostResponse from(WorkPost p, String writerName) {
            return new WorkPostResponse(
                    p.getId(), p.getPostNo(), p.getPostDate(),
                    p.getTitle(), p.getContent(), p.getWriter(), writerName, p.getForwardTo(),
                    p.getStatus(), p.getStatus().getDisplayName());
        }
    }
}
