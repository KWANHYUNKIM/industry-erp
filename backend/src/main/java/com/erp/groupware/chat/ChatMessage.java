package com.erp.groupware.chat;

import com.erp.auth.user.User;
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

    /** [보기] 단추가 여는 화면(권한요청 알림 → 권한승인대기현황). 사람이 쓴 메시지는 null. */
    @Column(name = "link_to", length = 200)
    private String linkTo;

    @Column(name = "sent_at", nullable = false)
    private LocalDateTime sentAt;

    public boolean isSystem() {
        return sender == null;
    }
}
