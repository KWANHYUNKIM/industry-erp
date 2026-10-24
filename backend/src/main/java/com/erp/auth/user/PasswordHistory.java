package com.erp.auth.user;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 비밀번호를 정할 때마다 남기는 해시 — 보안설정 '동일 비밀번호 사용제한:N회'(원본 C001138)가 최근 N개와 견준다.
 * 평문은 남기지 않는다.
 */
@Entity
@Table(name = "password_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PasswordHistory extends BaseTimeEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;
}
