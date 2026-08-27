package com.erp.groupware.dto;

import com.erp.groupware.domain.ApprovalDocument;
import com.erp.groupware.domain.ApprovalDocumentVoucher;
import com.erp.groupware.domain.ApprovalLine;
import com.erp.groupware.domain.ApprovalLineStatus;
import com.erp.groupware.domain.ApprovalParticipant;
import com.erp.groupware.domain.ApprovalParticipantRole;
import com.erp.groupware.domain.ApprovalStatus;
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
            /** 구분 — 원본 폼의 [구분] 코드도움 */
            String category,
            /** 출력양식 — 인쇄 서식 이름 */
            String printFormat,
            /** 라벨 — 문서를 묶어 보는 꼬리표 */
            String labelText,
            /** 첨부 파일 id (공용 stored_files). 업로드는 별도 엔드포인트로 먼저 한다. */
            Long attachmentId,
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

    /** 라벨 변경 — 원본 내결재관리 하단의 [라벨변경]. 여러 문서를 골라 한 번에 바꾼다. */
    public record ChangeLabelRequest(
            String labelText
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
            String category, String printFormat, String labelText,
            Long attachmentId, String attachmentName,
            boolean deleted,
            String currentApproverName,
            /**
             * 작업자 · 작업일시 — 원본 기안서통합관리의 마지막 두 열이다.
             *
             * <p><b>마지막으로 이 문서를 움직인 사람</b>과 그 시각이다. 결재선에서 가장 늦게
             * 처리된 줄을 본다. 아직 아무도 결재하지 않았으면 기안자와 기안 시각이다 —
             * 그것이 이 문서에 마지막으로 일어난 일이기 때문이다.
             *
             * <p>따로 컬럼을 만들지 않았다. 결재선이 이미 누가 언제 처리했는지(actedAt)를
             * 들고 있어서, 컬럼을 더 두면 같은 사실이 두 군데 적히고 어긋날 수 있다.
             */
            String lastActorName,
            java.time.LocalDateTime lastActedAt,
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

            // 가장 늦게 처리된 결재선. 아무도 처리 안 했으면 기안 그 자체가 마지막 일이다.
            var lastLine = d.getLines().stream()
                    .filter(l -> l.getActedAt() != null)
                    .max(java.util.Comparator.comparing(
                            com.erp.groupware.domain.ApprovalLine::getActedAt));
            String lastActorName = lastLine
                    .map(l -> l.getApprover().getName())
                    .orElseGet(() -> d.getDrafter().getName());
            java.time.LocalDateTime lastActedAt = lastLine
                    .map(com.erp.groupware.domain.ApprovalLine::getActedAt)
                    .orElseGet(d::getCreatedAt);
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
                    d.getCategory(), d.getPrintFormat(), d.getLabelText(),
                    d.getAttachment() != null ? d.getAttachment().getId() : null,
                    d.getAttachment() != null ? d.getAttachment().getName() : null,
                    d.isDeleted(),
                    currentApprover,
                    lastActorName, lastActedAt,
                    d.getVouchers().size(),
                    d.getLines().stream().map(ApprovalLineResponse::from).toList(),
                    d.getParticipants().stream().map(ApprovalParticipantResponse::from).toList(),
                    d.getVouchers().stream().map(ApprovalVoucherResponse::from).toList());
        }
    }
}
