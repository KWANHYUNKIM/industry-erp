package com.erp.groupware.dto;

import com.erp.groupware.domain.WorkPost;
import com.erp.groupware.domain.WorkPostStatus;
import com.erp.groupware.domain.enums.PostBoard;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class WorkPostDtos {

    private WorkPostDtos() {}

    public record CreateWorkPostRequest(
            /** 안 주면 WORK 게시판. 공지사항은 NOTICE 로 보낸다. */
            PostBoard board,
            @NotBlank(message = "제목을 입력하세요.") String title,
            @NotBlank(message = "내용을 입력하세요.") String content,
            String forwardTo,
            /** 원본 WORK입력 폼의 [참조자]. 전달자와 같은 자유입력. */
            String ccTo,
            /** 원본 WORK입력 폼의 [공지사항여부]. 켜면 목록 맨 위에 붙는다. 안 주면 꺼짐. */
            Boolean notice,
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
            String ccTo,
            /** 원본 [공지사항여부]. 안 주면 끈다 — 수정은 통째로 덮는다. */
            Boolean notice,
            /** null 이면 첨부를 뗀다. 안 보내는 것과 구분하지 않는다 — 수정은 통째로 덮는다. */
            Long attachmentId
    ) {}

    public record UpdateWorkPostStatusRequest(
            WorkPostStatus status,
            /**
             * 원본 [완료일시]. 안 주고 완료로 바꾸면 <b>지금</b>으로 찍는다.
             * 뒤늦게 정리하는 경우가 있어 직접 적을 수도 있게 둔다.
             */
            LocalDateTime completedAt
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
            /** 원본 WORK입력 폼의 [참조자]. */
            String ccTo,
            /** 원본 [공지사항여부]. true 면 목록 맨 위에 붙는다. */
            boolean notice,
            WorkPostStatus status, String statusName,
            /** 원본 [완료일시]. 진행중이면 null 이다. */
            LocalDateTime completedAt,
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
                    p.getCcTo(), p.isNotice(),
                    p.getStatus(), p.getStatus().getDisplayName(), p.getCompletedAt(),
                    f != null ? f.getId() : null,
                    f != null ? f.getName() : null,
                    f != null ? f.getSizeBytes() : null,
                    p.getViewCount());
        }
    }
}
