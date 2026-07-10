package com.erp.dto;

import com.erp.domain.ApprovalDocument;
import com.erp.domain.ApprovalDocumentVoucher;
import com.erp.domain.ApprovalLine;
import com.erp.domain.ApprovalLineStatus;
import com.erp.domain.ApprovalParticipant;
import com.erp.domain.ApprovalParticipantRole;
import com.erp.domain.ApprovalStatus;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class ApprovalDtos {

    private ApprovalDtos() {}

    /**
     * 양식은 formTemplateId 또는 formType(=양식코드) 중 하나로 지정한다.
     * 예전 프론트가 enum 이름을 formType 으로 보내는데 양식 마스터의 code 와 값이 같아 그대로 받는다.
     */
    public record CreateApprovalRequest(
            Long formTemplateId,
            String formType,
            @NotBlank(message = "제목을 입력하세요.") String title,
            String content,
            Map<String, Object> formData,
            LocalDate draftDate,
            String department,
            Long projectId,
            String reference,
            List<Long> approverIds,
            List<Long> referenceUserIds,
            List<Long> shareUserIds,
            /** true 면 임시저장(기안중). 결재선 없이 저장할 수 있다. */
            boolean temporary
    ) {}

    /** 기안서에 ERP 전표를 연결한다. 셋 중 정확히 하나만 지정한다. */
    public record LinkVoucherRequest(
            Long salesId,
            Long purchaseId,
            Long expenseId
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

    public record ApprovalParticipantResponse(
            Long userId, String userName,
            ApprovalParticipantRole role, String roleName
    ) {
        public static ApprovalParticipantResponse from(ApprovalParticipant p) {
            return new ApprovalParticipantResponse(
                    p.getUser().getId(), p.getUser().getName(),
                    p.getRole(), p.getRole().getDisplayName());
        }
    }

    public record ApprovalVoucherResponse(
            Long id, String voucherType, Long voucherId, String voucherNo
    ) {
        public static ApprovalVoucherResponse from(ApprovalDocumentVoucher v) {
            return new ApprovalVoucherResponse(
                    v.getId(), v.getVoucherType(), v.getVoucherId(), v.getVoucherNo());
        }
    }

    public record ApprovalResponse(
            Long id,
            /** 기안서No. */
            String docNo,
            /** 기안No. (2026/07/10-2) */
            String draftNo,
            Long formTemplateId,
            /** 양식코드. 예전 formType enum 이름과 값이 같다. */
            String formType,
            String formTypeName,
            String title, String content,
            Map<String, Object> formData,
            Long drafterId, String drafterName,
            LocalDate draftDate,
            String department,
            Long projectId, String projectName,
            ApprovalStatus status, String statusName,
            int currentStep, String reference,
            boolean deleted,
            String currentApproverName,
            int voucherCount,
            List<ApprovalLineResponse> lines,
            List<ApprovalParticipantResponse> participants,
            List<ApprovalVoucherResponse> vouchers
    ) {
        public static ApprovalResponse from(ApprovalDocument d) {
            String currentApprover = d.getLines().stream()
                    .filter(l -> l.getStepOrder() == d.getCurrentStep())
                    .map(l -> l.getApprover().getName())
                    .findFirst().orElse(null);
            return new ApprovalResponse(
                    d.getId(), d.getDocNo(), d.getDraftNo(),
                    d.getFormTemplate().getId(),
                    d.getFormTemplate().getCode(),
                    d.getFormTemplate().getName(),
                    d.getTitle(), d.getContent(), d.getFormData(),
                    d.getDrafter().getId(), d.getDrafter().getName(),
                    d.getDraftDate(),
                    d.getDepartment(),
                    d.getProject() != null ? d.getProject().getId() : null,
                    d.getProject() != null ? d.getProject().getName() : null,
                    d.getStatus(), d.getStatus().getDisplayName(),
                    d.getCurrentStep(), d.getReference(),
                    d.isDeleted(),
                    currentApprover,
                    d.getVouchers().size(),
                    d.getLines().stream().map(ApprovalLineResponse::from).toList(),
                    d.getParticipants().stream().map(ApprovalParticipantResponse::from).toList(),
                    d.getVouchers().stream().map(ApprovalVoucherResponse::from).toList());
        }
    }
}
