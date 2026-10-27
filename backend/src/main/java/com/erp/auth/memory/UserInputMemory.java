package com.erp.auth.memory;

import com.erp.auth.user.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 사용자별 '마지막에 쓴 값' 기억(키 → 값). 원본은 계정마다 서버에 둔다. */
@Entity
@Table(name = "user_input_memories",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_input_memories_user_key",
                columnNames = {"user_id", "mem_key"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class UserInputMemory extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "mem_key", nullable = false, length = 100)
    private String key;

    @Column(name = "mem_value", nullable = false, columnDefinition = "text")
    private String value;
}
