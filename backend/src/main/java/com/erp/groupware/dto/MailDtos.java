package com.erp.groupware.dto;

import com.erp.groupware.domain.Mail;
import com.erp.groupware.domain.enums.MailStatus;
import com.erp.groupware.domain.enums.MailType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;
import java.util.List;

public final class MailDtos {

    private MailDtos() {}

    /** 사내메일 발송 */
    public record SendMailRequest(
            @NotNull(message = "받는 사람을 선택하세요.") Long recipientId,
            @NotBlank(message = "제목을 입력하세요.") String subject,
            String body
    ) {}

    /** 공용메일 수신 등록. 외부 메일 서버 연동이 없어 사람이 등록한다. */
    public record ReceiveSharedMailRequest(
            @NotBlank(message = "보낸 사람 주소를 입력하세요.") String fromAddress,
            @NotBlank(message = "제목을 입력하세요.") String subject,
            String body,
            LocalDateTime receivedAt
    ) {}

    /** 공용메일 담당자 배정 */
    public record AssignMailRequest(
            @NotNull(message = "담당자를 선택하세요.") Long assigneeId
    ) {}

    /** 공용메일 처리 완료 */
    public record HandleMailRequest(String note) {}

    public record MailResponse(
            Long id,
            MailType type, String typeName,
            Long senderId, String senderName, String fromAddress,
            Long recipientId, String recipientName,
            String subject, String body,
            LocalDateTime sentAt,
            MailStatus status, String statusName,
            Long assigneeId, String assigneeName,
            LocalDateTime handledAt, String handleNote
    ) {
        public static MailResponse from(Mail m) {
            return new MailResponse(
                    m.getId(),
                    m.getType(), m.getType().getDisplayName(),
                    m.getSender() != null ? m.getSender().getId() : null,
                    m.getSender() != null ? m.getSender().getName() : null,
                    m.getFromAddress(),
                    m.getRecipient() != null ? m.getRecipient().getId() : null,
                    m.getRecipient() != null ? m.getRecipient().getName() : null,
                    m.getSubject(), m.getBody(), m.getSentAt(),
                    m.getStatus(), m.getStatus().getDisplayName(),
                    m.getAssignee() != null ? m.getAssignee().getId() : null,
                    m.getAssignee() != null ? m.getAssignee().getName() : null,
                    m.getHandledAt(), m.getHandleNote());
        }
    }

    /** 공용메일함: 목록 + 미처리 건수 */
    public record SharedMailBox(
            long pendingCount,
            List<MailResponse> mails
    ) {}
}
