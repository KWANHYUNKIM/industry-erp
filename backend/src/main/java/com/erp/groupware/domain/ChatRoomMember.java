package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 대화방 참여자. 읽음 상태를 메시지마다 두지 않고 참여자마다 {@link #lastReadAt} 하나로 관리한다.
 * 메시지×참여자 행을 만들면 방 하나에 수만 행이 쌓이는데, 정작 화면이 쓰는 정보는 "내가 어디까지 봤나"뿐이다.
 */
@Entity
@Table(name = "chat_room_members",
        uniqueConstraints = @UniqueConstraint(name = "uk_chat_room_members", columnNames = {"room_id", "user_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ChatRoomMember extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private ChatRoom room;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    /** 이 시각 이후 도착한 남의 메시지가 안 읽음. null 이면 아직 한 번도 안 열어본 방. */
    @Column(name = "last_read_at")
    private LocalDateTime lastReadAt;
}
