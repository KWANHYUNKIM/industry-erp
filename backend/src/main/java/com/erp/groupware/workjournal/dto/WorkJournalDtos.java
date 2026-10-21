package com.erp.groupware.workjournal.dto;

import com.erp.groupware.workjournal.WorkJournal;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.util.List;

public final class WorkJournalDtos {

    private WorkJournalDtos() {}

    public record CreateWorkJournalRequest(
            LocalDate reportDate,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String department,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String partnerName,
            Long projectId,
            @Size(max = 200, message = "제목은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "제목을 입력하세요.") String title,
            /** 원본은 본문 없이도 저장된다(2026-10-03 실측) — 비우면 빈 글자로 둔다. */
            String content,
            /** 답글이면 원글 id — 원본 '조회' 창 [답글(F8)] · [답변]. 고칠 때는 보내도 바뀌지 않는다. */
            Long parentId,
            /** 첨부 파일(POST /files 의 id). 고칠 때 안 보내면 뗀다. */
            Long attachmentId
    ) {}

    public record WorkJournalResponse(
            Long id,
            LocalDate reportDate,
            Long authorId, String authorName,
            String department, String partnerName,
            /** 거래처 마스터와 이름이 정확히 일치할 때만 채워진다(아니면 null) */
            Long partnerId,
            Long projectId, String projectName,
            String title, String content,
            /** 원본 '조회' 머리의 작성 시각('2026/10/03 오후 6:20:13'). */
            java.time.LocalDateTime createdAt,
            /** 답글이면 원글 id. 격자에는 원글(null)만 찍는다. */
            Long parentId,
            Long attachmentId, String attachmentName, Long attachmentSize
    ) {
        public static WorkJournalResponse from(WorkJournal j) {
            return new WorkJournalResponse(
                    j.getId(), j.getReportDate(),
                    j.getAuthor().getId(), j.getAuthor().getName(),
                    j.getDepartment(), j.getPartnerName(),
                    j.getPartner() != null ? j.getPartner().getId() : null,
                    j.getProject() != null ? j.getProject().getId() : null,
                    j.getProject() != null ? j.getProject().getName() : null,
                    j.getTitle(), j.getContent(), j.getCreatedAt(), j.getParentId(),
                    j.getAttachment() != null ? j.getAttachment().getId() : null,
                    j.getAttachment() != null ? j.getAttachment().getName() : null,
                    j.getAttachment() != null ? j.getAttachment().getSizeBytes() : null);
        }
    }

    /** 원본 [R] '조회자 현황' — 왼쪽 [미조회자] 이름, 오른쪽 [조회자] 이름 · 최초조회일시 · 최종조회일시. */
    public record WorkJournalViewersResponse(List<String> notViewed, List<Viewer> viewed) {
        public record Viewer(String name, java.time.LocalDateTime firstViewedAt, java.time.LocalDateTime lastViewedAt) {}
    }
}
