package com.erp.dto;

import com.erp.domain.WorkJournal;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public final class WorkJournalDtos {

    private WorkJournalDtos() {}

    public record CreateWorkJournalRequest(
            LocalDate reportDate,
            String department,
            String partnerName,
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
            String title, String content
    ) {
        public static WorkJournalResponse from(WorkJournal j) {
            return new WorkJournalResponse(
                    j.getId(), j.getReportDate(),
                    j.getAuthor().getId(), j.getAuthor().getName(),
                    j.getDepartment(), j.getPartnerName(),
                    j.getPartner() != null ? j.getPartner().getId() : null,
                    j.getTitle(), j.getContent());
        }
    }
}
