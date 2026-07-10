package com.erp.dto;

import com.erp.domain.Survey;
import com.erp.domain.SurveyStatus;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public final class SurveyDtos {

    private SurveyDtos() {}

    public record CreateSurveyRequest(
            @NotBlank(message = "설문 제목을 입력하세요.") String title,
            LocalDate startDate,
            LocalDate endDate,
            @Min(value = 0, message = "대상 인원은 0 이상입니다.") Integer target
    ) {}

    /** null 필드는 변경하지 않음. */
    public record UpdateSurveyRequest(
            String title,
            LocalDate startDate,
            LocalDate endDate,
            @Min(value = 0, message = "대상 인원은 0 이상입니다.") Integer target,
            SurveyStatus status
    ) {}

    public record SurveyResponse(
            Long id, String title, LocalDate startDate, LocalDate endDate,
            int target, int responses, int responseRate,
            SurveyStatus status, String statusName, String createdBy
    ) {
        public static SurveyResponse from(Survey s) {
            int rate = s.getTarget() > 0 ? Math.round(s.getResponses() * 100f / s.getTarget()) : 0;
            return new SurveyResponse(
                    s.getId(), s.getTitle(), s.getStartDate(), s.getEndDate(),
                    s.getTarget(), s.getResponses(), rate,
                    s.getStatus(), s.getStatus().getDisplayName(), s.getCreatedBy());
        }
    }
}
