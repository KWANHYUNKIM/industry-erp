package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;

/**
 * E Note — 개인 메모. 다른 사람 것은 보이지 않는다(조회·삭제 모두 본인 것만).
 */
@Entity
@Table(name = "user_notes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserNote extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    /** 목록에서 위로 고정 */
    @Column(nullable = false)
    @Builder.Default
    private boolean pinned = false;
}
