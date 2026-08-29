package com.erp.groupware.dto;

import com.erp.groupware.domain.WorkJournal;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

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
            @NotBlank(message = "내용을 입력하세요.") String content
    ) {}

    public record WorkJournalResponse(
            Long id,
            LocalDate reportDate,
            Long authorId, String authorName,
            String department, String partnerName,
            /** 거래처 마스터와 이름이 정확히 일치할 때만 채워진다(아니면 null) */
            Long partnerId,
            Long projectId, String projectName,
            String title, String content
    ) {
        public static WorkJournalResponse from(WorkJournal j) {
            return new WorkJournalResponse(
                    j.getId(), j.getReportDate(),
                    j.getAuthor().getId(), j.getAuthor().getName(),
                    j.getDepartment(), j.getPartnerName(),
                    j.getPartner() != null ? j.getPartner().getId() : null,
                    j.getProject() != null ? j.getProject().getId() : null,
                    j.getProject() != null ? j.getProject().getName() : null,
                    j.getTitle(), j.getContent());
        }
    }
}
