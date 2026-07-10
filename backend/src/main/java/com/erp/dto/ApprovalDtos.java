package com.erp.dto;

import com.erp.domain.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class ApprovalDtos {

    private ApprovalDtos() {}

    public record CreateApprovalRequest(
            @NotNull(message = "양식을 선택하세요.") ApprovalFormType formType,
            @NotBlank(message = "제목을 입력하세요.") String title,
            @NotBlank(message = "내용을 입력하세요.") String content,
            LocalDate draftDate,
            String reference,
            @NotEmpty(message = "결재자를 1명 이상 지정하세요.") List<Long> approverIds
    ) {}

    public record ApprovalActionRequest(
            String comment
    ) {}

    public record ApprovalLineResponse(
            Long id, int stepOrder,
            Long approverId, String approverName,
            ApprovalLineStatus status, String statusName,
            String comment, LocalDateTime actedAt
    ) {
        public static ApprovalLineResponse from(ApprovalLine l) {
            return new ApprovalLineResponse(
                    l.getId(), l.getStepOrder(),
                    l.getApprover().getId(), l.getApprover().getName(),
                    l.getStatus(), l.getStatus().getDisplayName(),
                    l.getComment(), l.getActedAt());
        }
    }

    public record ApprovalResponse(
            Long id, String docNo,
            ApprovalFormType formType, String formTypeName,
            String title, String content,
            Long drafterId, String drafterName,
            LocalDate draftDate,
            ApprovalStatus status, String statusName,
            int currentStep, String reference,
            String currentApproverName,
            List<ApprovalLineResponse> lines
    ) {
        public static ApprovalResponse from(ApprovalDocument d) {
            String currentApprover = d.getLines().stream()
                    .filter(l -> l.getStepOrder() == d.getCurrentStep())
                    .map(l -> l.getApprover().getName())
                    .findFirst().orElse(null);
            return new ApprovalResponse(
                    d.getId(), d.getDocNo(),
                    d.getFormType(), d.getFormType().getDisplayName(),
                    d.getTitle(), d.getContent(),
                    d.getDrafter().getId(), d.getDrafter().getName(),
                    d.getDraftDate(),
                    d.getStatus(), d.getStatus().getDisplayName(),
                    d.getCurrentStep(), d.getReference(),
                    currentApprover,
                    d.getLines().stream().map(ApprovalLineResponse::from).toList());
        }
    }
}
