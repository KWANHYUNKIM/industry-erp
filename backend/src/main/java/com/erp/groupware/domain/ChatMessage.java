package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 대화방에 쌓이는 메시지. {@code sender == null} 이면 시스템 안내(참여·퇴장·방 이름 변경)로,
 * 사람 메시지와 같은 흐름에 섞여 보인다.
 */
@Entity
@Table(name = "chat_messages")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ChatMessage extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private ChatRoom room;

    /** null 이면 시스템 안내. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    private User sender;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "sent_at", nullable = false)
    private LocalDateTime sentAt;

    public boolean isSystem() {
        return sender == null;
    }
}
