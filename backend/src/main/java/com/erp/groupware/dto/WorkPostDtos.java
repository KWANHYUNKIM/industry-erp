package com.erp.groupware.dto;

import com.erp.groupware.domain.WorkPost;
import com.erp.groupware.domain.WorkPostStatus;
import com.erp.groupware.domain.enums.PostBoard;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public final class WorkPostDtos {

    private WorkPostDtos() {}

    public record CreateWorkPostRequest(
            /** 안 주면 WORK 게시판. 공지사항은 NOTICE 로 보낸다. */
            PostBoard board,
            @NotBlank(message = "제목을 입력하세요.") String title,
            @NotBlank(message = "내용을 입력하세요.") String content,
            String forwardTo,
            LocalDate postDate,
            /** 첨부 파일 id. 원본 격자의 [첨부] 열. 안 붙일 수 있다. */
            Long attachmentId
    ) {}

    /**
     * 게시글 고치기. 원본 게시판의 펼친 글 아래에 [답글(F8)·복사·<b>수정</b>·삭제·닫기]가 있다.
     *
     * <p>작성자·게시글번호·일자는 바꾸지 않는다 — 그건 그 글이 언제 누구 것으로 올라갔는지라
     * 나중에 고칠 수 있으면 기록이 아니게 된다.
     */
    public record UpdateWorkPostRequest(
            @NotBlank(message = "제목을 입력하세요.") String title,
            @NotBlank(message = "내용을 입력하세요.") String content,
            String forwardTo,
            /** null 이면 첨부를 뗀다. 안 보내는 것과 구분하지 않는다 — 수정은 통째로 덮는다. */
            Long attachmentId
    ) {}

    public record UpdateWorkPostStatusRequest(
            WorkPostStatus status
    ) {}

    public record WorkPostResponse(
            Long id, PostBoard board, String boardName,
            int postNo, LocalDate postDate,
            String title, String content,
            /** 작성자 로그인 아이디 (users.username FK) */
            String writer,
            /** 작성자 표시 이름. 화면은 이걸 보여 준다 — writer 는 아이디라 사람이 읽기 나쁘다. */
            String writerName,
            String forwardTo,
            WorkPostStatus status, String statusName,
            /** 원본 [첨부] 열. 파일이 없으면 셋 다 null 이다. */
            Long attachmentId, String attachmentName, Long attachmentSize,
            /** 원본 [조회] 열. */
            int viewCount
    ) {
        public static WorkPostResponse from(WorkPost p, String writerName) {
            var f = p.getAttachment();
            return new WorkPostResponse(
                    p.getId(), p.getBoard(), p.getBoard().getDisplayName(),
                    p.getPostNo(), p.getPostDate(),
                    p.getTitle(), p.getContent(), p.getWriter(), writerName, p.getForwardTo(),
                    p.getStatus(), p.getStatus().getDisplayName(),
                    f != null ? f.getId() : null,
                    f != null ? f.getName() : null,
                    f != null ? f.getSizeBytes() : null,
                    p.getViewCount());
        }
    }
}
