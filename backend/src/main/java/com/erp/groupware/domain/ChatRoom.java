package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 메신저 대화방. 1:1({@code direct=true})과 그룹방을 한 테이블에 둔다.
 *
 * <p>1:1 방은 같은 두 사람에 대해 하나만 있어야 한다. 매번 새로 만들면 대화가 방마다 흩어져서
 * "어제 한 얘기"를 못 찾는다. 그래서 두 사용자 id 를 정렬해 만든 {@link #directKey} 에 UNIQUE 를 걸고,
 * 방을 열 때 있으면 재사용한다.
 */
@Entity
@Table(name = "chat_rooms")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ChatRoom extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 그룹방 이름. 1:1 방은 상대 이름을 화면에서 만들어 쓰므로 null. */
    @Column(length = 100)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private boolean direct = false;

    /** 1:1 방 중복 방지 키 ("작은id:큰id"). 그룹방은 null. */
    @Column(name = "direct_key", length = 40, unique = true)
    private String directKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private User createdBy;

    /** 방 목록 정렬용 비정규화 값. 메시지를 보낼 때 갱신한다. */
    @Column(name = "last_message_at")
    private LocalDateTime lastMessageAt;

    /** 두 사용자의 1:1 방 키. 순서에 상관없이 같은 값이 나와야 한다. */
    public static String directKeyOf(Long a, Long b) {
        return a <= b ? a + ":" + b : b + ":" + a;
    }
}
