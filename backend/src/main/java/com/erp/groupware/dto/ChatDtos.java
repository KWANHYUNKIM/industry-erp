package com.erp.groupware.dto;

import com.erp.groupware.domain.ChatMessage;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;
import java.util.List;

public final class ChatDtos {

    private ChatDtos() {}

    /** 1:1 대화 열기. 이미 있으면 그 방을 돌려준다. */
    public record OpenDirectRequest(
            @NotNull(message = "대화 상대를 선택하세요.") Long userId
    ) {}

    /** 그룹 대화방 만들기. 만든 사람은 자동으로 참여자가 된다. */
    public record CreateRoomRequest(
            @NotBlank(message = "대화방 이름을 입력하세요.") String name,
            @NotEmpty(message = "참여자를 선택하세요.") List<Long> memberIds
    ) {}

    public record InviteRequest(
            @NotEmpty(message = "초대할 사람을 선택하세요.") List<Long> memberIds
    ) {}

    public record RenameRequest(
            @NotBlank(message = "대화방 이름을 입력하세요.") String name
    ) {}

    public record SendMessageRequest(
            @NotBlank(message = "메시지를 입력하세요.") String content
    ) {}

    public record ChatMemberResponse(Long userId, String name, String department) {}

    /** 방 목록 한 줄. title 은 1:1 이면 상대 이름, 그룹이면 방 이름이다(내가 보는 기준). */
    public record ChatRoomResponse(
            Long id,
            String title,
            boolean direct,
            int memberCount,
            List<ChatMemberResponse> members,
            String lastMessage,
            String lastSenderName,
            LocalDateTime lastMessageAt,
            long unread
    ) {}

    public record ChatMessageResponse(
            Long id,
            Long roomId,
            Long senderId,
            String senderName,
            String content,
            LocalDateTime sentAt,
            boolean system
    ) {
        public static ChatMessageResponse from(ChatMessage m) {
            return new ChatMessageResponse(
                    m.getId(),
                    m.getRoom().getId(),
                    m.getSender() != null ? m.getSender().getId() : null,
                    m.getSender() != null ? m.getSender().getName() : "안내",
                    m.getContent(),
                    m.getSentAt(),
                    m.isSystem());
        }
    }

    /** 앱바 배지. */
    public record ChatUnread(long unread) {}
}
