package com.erp.groupware.dto;

import com.erp.groupware.domain.ShortMessage;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.time.LocalDateTime;
import java.util.List;

public final class ShortMessageDtos {

    private ShortMessageDtos() {}

    /** 쪽지 보내기. 받는 사람이 여러 명이면 사람 수만큼 쪽지가 생긴다(각자 따로 확인·삭제). */
    public record SendShortMessageRequest(
            @NotEmpty(message = "받는 사람을 선택하세요.") List<Long> recipientIds,
            @NotBlank(message = "내용을 입력하세요.") String content,
            Long partnerId
    ) {}

    /** 선택삭제 */
    public record DeleteShortMessagesRequest(
            @NotEmpty(message = "삭제할 쪽지를 선택하세요.") List<Long> ids
    ) {}

    public record ShortMessageResponse(
            Long id,
            Long senderId, String senderName,
            Long recipientId, String recipientName,
            Long partnerId, String partnerName,
            String content,
            LocalDateTime sentAt,
            LocalDateTime readAt,
            boolean archived,
            boolean system,
            String statusName,
            String linkSource, String linkRef, String linkPath
    ) {
        public static ShortMessageResponse from(ShortMessage m) {
            return new ShortMessageResponse(
                    m.getId(),
                    m.getSender() != null ? m.getSender().getId() : null,
                    m.getSender() != null ? m.getSender().getName() : "시스템",
                    m.getRecipient().getId(), m.getRecipient().getName(),
                    m.getPartner() != null ? m.getPartner().getId() : null,
                    m.getPartner() != null ? m.getPartner().getName() : null,
                    m.getContent(), m.getSentAt(), m.getReadAt(), m.isArchived(),
                    m.isSystem(),
                    m.getReadAt() == null ? "미확인" : "확인",
                    m.getLinkSource(), m.getLinkRef(), m.getLinkPath());
        }
    }

    /** 미확인 건수(상단 배지) */
    public record UnreadCount(long unread) {}
}
