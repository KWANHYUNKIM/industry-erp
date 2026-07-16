package com.erp.auth.domain;

import jakarta.persistence.*;
import lombok.*;

import java.util.HashSet;
import java.util.Set;
import com.erp.common.BaseTimeEntity;

/**
 * 시스템 사용자(직원) 계정.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class User extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 로그인 아이디 */
    @Column(nullable = false, unique = true, length = 50)
    private String username;

    /** BCrypt 해시된 비밀번호 */
    @Column(nullable = false, length = 100)
    private String password;

    /** 사용자 이름(한국어 표시명) */
    @Column(nullable = false, length = 50)
    private String name;

    @Column(length = 100)
    private String email;

    /** 소속 부서 */
    @Column(length = 50)
    private String department;

    /** 계정 활성화 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
            name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    @Builder.Default
    private Set<Role> roles = new HashSet<>();

    public void addRole(Role role) {
        this.roles.add(role);
    }
}
