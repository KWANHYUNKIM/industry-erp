package com.erp.groupware.workpost.dto;

import com.erp.groupware.workpost.WorkPost;
import com.erp.groupware.workpost.WorkPostStatus;
import com.erp.groupware.board.PostBoard;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class WorkPostDtos {

    private WorkPostDtos() {}

    public record CreateWorkPostRequest(
            /** 안 주면 WORK 게시판. 공지사항은 NOTICE 로 보낸다. */
            PostBoard board,
            @Size(max = 200, message = "제목은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "제목을 입력하세요.") String title,
            /** 내용. 통합회의록은 비워도 저장된다(원본 2026-10-13) — 그 밖의 게시판은 서버가 '내용을 입력하세요.' 로 막는다. */
            String content,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String forwardTo,
            /** 원본 WORK입력 폼의 [참조자]. 전달자와 같은 자유입력. */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String ccTo,
            /** 원본 WORK입력 폼의 [공지사항여부]. 켜면 목록 맨 위에 붙는다. 안 주면 꺼짐. */
            Boolean notice,
            LocalDate postDate,
            /** 첨부 파일 id. 원본 격자의 [첨부] 열. 안 붙일 수 있다. */
            Long attachmentId,
            /** 원본 입력 창 맨 위 [진행상태] — 회사가 정한 이름을 쓰는 게시판만(SHARED · MEETING · SIGN). */
            @Size(max = 40, message = "진행상태는 40자까지 넣을 수 있습니다.") String stage,
            /** 통합회의록 [주 차 구분] 1 ~ 5. 다른 게시판은 무시한다. */
            Integer weekNo,
            /** 통합회의록 부서 칸(경영지원팀 · 구매팀 · 생산팀 · 영업팀 회의록)에 이을 팀별회의록 글 id, 칸 차례대로(빈 칸은 null). */
            java.util.List<Long> meetingLinks,
            /** 업무관리 예시 게시판의 입력항목(이름:값 JSON). 다른 게시판은 무시한다. */
            @Size(max = 2000, message = "입력항목이 너무 깁니다.") String extraFields,
            /** 간판제작 [프로젝트] · [칸반연결](진행현황 칸반 글 id). 다른 게시판은 무시한다. */
            @Size(max = 100, message = "프로젝트는 100자까지 넣을 수 있습니다.") String project,
            Long kanbanPostId,
            /** 간판제작 입력 창 [완료일시](원본 처음 값 = 지금, 2026-10-20 실측). 비우면 저장한 때. 다른 게시판은 무시한다. */
            LocalDateTime completedAt
    ) {}

    /**
     * 게시글 고치기. 원본 게시판의 펼친 글 아래에 [답글(F8)·복사·<b>수정</b>·삭제·닫기]가 있다.
     *
     * <p>작성자·게시글번호·일자는 바꾸지 않는다 — 그건 그 글이 언제 누구 것으로 올라갔는지라
     * 나중에 고칠 수 있으면 기록이 아니게 된다.
     */
    public record UpdateWorkPostRequest(
            @Size(max = 200, message = "제목은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "제목을 입력하세요.") String title,
            /** 내용. 통합회의록은 비워도 저장된다(원본 2026-10-13) — 그 밖의 게시판은 서버가 '내용을 입력하세요.' 로 막는다. */
            String content,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String forwardTo,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String ccTo,
            /** 원본 [공지사항여부]. 안 주면 끈다 — 수정은 통째로 덮는다. */
            Boolean notice,
            /** null 이면 첨부를 뗀다. 안 보내는 것과 구분하지 않는다 — 수정은 통째로 덮는다. */
            Long attachmentId,
            /** 원본 입력 창 [진행상태] — 회사가 정한 이름을 쓰는 게시판만. 그 밖의 게시판은 무시한다. */
            @Size(max = 40, message = "진행상태는 40자까지 넣을 수 있습니다.") String stage,
            /** 통합회의록 [주 차 구분]. 수정은 통째로 덮는다. */
            Integer weekNo,
            /** 통합회의록 부서 칸에 이은 팀별회의록 글 id(칸 차례대로, 빈 칸은 null). */
            java.util.List<Long> meetingLinks,
            /** 업무관리 예시 게시판의 입력항목(이름:값 JSON). 수정은 통째로 덮는다. */
            @Size(max = 2000, message = "입력항목이 너무 깁니다.") String extraFields,
            /** 간판제작 [프로젝트] · [칸반연결](진행현황 칸반 글 id). 다른 게시판은 무시한다. */
            @Size(max = 100, message = "프로젝트는 100자까지 넣을 수 있습니다.") String project,
            Long kanbanPostId,
            /** 간판제작 입력 창 [완료일시](원본 처음 값 = 지금, 2026-10-20 실측). 비우면 저장한 때. 다른 게시판은 무시한다. */
            LocalDateTime completedAt
    ) {}

    /** 원본 '조회자 현황'의 오른쪽 한 줄 — 이름 · 최초조회일시 · 최종조회일시. */
    public record Reader(String name, LocalDateTime firstReadAt, LocalDateTime lastReadAt) {}

    /** 원본 '조회자 현황' — 왼쪽 미조회자 이름, 오른쪽 조회자. */
    public record ReadersResponse(java.util.List<Reader> readers, java.util.List<String> nonReaders) {}

    /** 원본 하단 [라벨변경] — 고른 라벨로 바꾼다(빈 목록이면 라벨을 뗀다). */
    /** 원본 '라벨등록' · '라벨수정' — 라벨코드(수정에선 안 씀) · 라벨명 · 색상('#33b579'). */
    public record SaveLabelRequest(
            com.erp.groupware.board.PostBoard board,
            @jakarta.validation.constraints.Size(max = 20, message = "라벨코드는 20자까지 넣을 수 있습니다.") String code,
            @jakarta.validation.constraints.Size(max = 20, message = "라벨명은 20자까지 넣을 수 있습니다.") String name,
            @jakarta.validation.constraints.Size(max = 7, message = "색상을 다시 고르세요.") String color
    ) {}

    public record LabelResponse(Long id, String board, String code, String name, String color, boolean active) {
        public static LabelResponse from(com.erp.groupware.workpost.WorkPostLabel l) {
            return new LabelResponse(l.getId(), l.getBoard().name(), l.getCode(), l.getName(), l.getColor(), l.isActive());
        }
    }

    public record UpdateWorkPostLabelsRequest(
            java.util.List<@jakarta.validation.constraints.Size(max = 20, message = "라벨은 20자까지 넣을 수 있습니다.") String> labels
    ) {}

    public record UpdateWorkPostStatusRequest(
            WorkPostStatus status,
            /**
             * 원본 [완료일시]. 안 주고 완료로 바꾸면 <b>지금</b>으로 찍는다.
             * 뒤늦게 정리하는 경우가 있어 직접 적을 수도 있게 둔다.
             */
            LocalDateTime completedAt,
            /** 회사가 정한 진행상태 이름으로 바꿀 때(SHARED · MEETING · SIGN 의 [진행상태변경]). 주면 status 는 안 건드린다. */
            @Size(max = 40, message = "진행상태는 40자까지 넣을 수 있습니다.") String stage
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
            int viewCount,
            /** 원본 View 머리줄의 작성 일시 — '16 | 제목 | guest | 2026/10/03 (토) 오후 12:53:08'. */
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            /** 원본 [라벨] 칩 */
            java.util.List<String> labels,
            /** 회사가 정한 진행상태 이름(SHARED · MEETING · SIGN). 그 게시판들은 statusName 도 이 이름이다. */
            String stage,
            /** 통합회의록 [주 차 구분] 1 ~ 5(격자 [주 차] 는 'n주차'). */
            Integer weekNo,
            /** 통합회의록 부서 칸마다 이은 팀별회의록 글 id(칸 차례대로, 빈 칸은 null). 다른 게시판은 빈 목록. */
            java.util.List<Long> meetingLinks,
            /** 업무관리 예시 게시판의 입력항목(이름:값 JSON). 없으면 null. */
            String extraFields,
            /** 간판제작 [프로젝트] · [칸반연결](📅 프로젝트 진행현황 칸반 글 id). 다른 게시판은 null. */
            String project,
            Long kanbanPostId
    ) {
        public static WorkPostResponse from(WorkPost p, String writerName) {
            var f = p.getAttachment();
            return new WorkPostResponse(
                    p.getId(), p.getBoard(), p.getBoard().getDisplayName(),
                    p.getPostNo(), p.getPostDate(),
                    p.getTitle(), p.getContent(), p.getWriter(), writerName, p.getForwardTo(),
                    p.getCcTo(), p.isNotice(),
                    p.getStatus(),
                    p.getBoard().namedStages() && p.getStage() != null ? p.getStage() : p.getStatus().getDisplayName(),
                    p.getCompletedAt(),
                    f != null ? f.getId() : null,
                    f != null ? f.getName() : null,
                    f != null ? f.getSizeBytes() : null,
                    p.getViewCount(), p.getCreatedAt(), p.getUpdatedAt(),
                    p.getLabels() == null || p.getLabels().isBlank() ? java.util.List.of()
                            : java.util.Arrays.stream(p.getLabels().split(",")).map(String::trim).filter(x -> !x.isEmpty()).toList(),
                    p.getStage(),
                    p.getWeekNo(),
                    parseLinks(p.getMeetingLinks()),
                    p.getExtraFields(),
                    p.getProject(),
                    p.getKanbanPost() != null ? p.getKanbanPost().getId() : null);
        }

        /** '12,,,15' → [12, null, null, 15]. 빈 글자 · null 이면 빈 목록. */
        public static java.util.List<Long> parseLinks(String s) {
            if (s == null || s.isEmpty()) return java.util.List.of();
            java.util.List<Long> out = new java.util.ArrayList<>();
            for (String x : s.split(",", -1)) out.add(x.isBlank() ? null : Long.valueOf(x.trim()));
            return java.util.Collections.unmodifiableList(out);
        }
    }
}
