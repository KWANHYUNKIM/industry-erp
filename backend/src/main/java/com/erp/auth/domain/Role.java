package com.erp.auth.domain;

import jakarta.persistence.*;
import lombok.*;

import java.util.HashSet;
import java.util.Set;

/**
 * 사용자 역할(권한 그룹).
 * 예: ADMIN(관리자), MANAGER(매니저), STAFF(사원)
 * Spring Security 에서는 "ROLE_" + name 형태의 권한으로 매핑된다.
 * <p>
 * 역할이 접근할 수 있는 메뉴/기능은 {@link #permissions} 로 데이터로 관리한다.
 * ADMIN 은 부여 목록과 무관하게 전권(인가 계층에서 바이패스).
 */
@Entity
@Table(name = "roles")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Role {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 역할 코드 (예: ADMIN, MANAGER, STAFF) */
    @Column(nullable = false, unique = true, length = 50)
    private String name;

    /** 화면 표기용 이름 (예: 관리자, 매니저, 사원) */
    @Column(nullable = false, length = 100)
    private String displayName;

    @Column(length = 255)
    private String description;

    /**
     * 이 역할이 접근할 수 있는 권한(메뉴) 집합.
     * <p>
     * LAZY 지만 인증 경로({@code CustomUserDetailsService.loadUserByUsername}, 트랜잭션 안)에서
     * {@code UserPrincipal} 이 즉시 순회해 초기화하므로 새 EAGER 를 만들지 않는다(CLAUDE.md 5.2).
     */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "role_permissions",
            joinColumns = @JoinColumn(name = "role_id"),
            inverseJoinColumns = @JoinColumn(name = "permission_code")
    )
    @Builder.Default
    private Set<Permission> permissions = new HashSet<>();
}
