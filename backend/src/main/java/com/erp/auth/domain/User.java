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

    /**
     * 연결된 사원(hr.Employee)의 id. <b>@ManyToOne 을 쓰지 않는다.</b>
     *
     * <p>auth 는 아무 모듈에도 의존하지 않는 기반층이다(CLAUDE.md 4.1).
     * hr 이 이미 auth 를 참조하므로 여기서 hr 을 참조하면 순환이 된다.
     * 그래서 id 만 들고, 사원번호·직급·부서명은 <b>hr 쪽에서</b> 붙인다.
     * inventory.Warehouse 가 공정·외주거래처를 드는 방식과 같다.
     *
     * <p>안 이은 계정(시스템 관리자 등)은 null 이고, 그때는 예전처럼
     * 자유입력 {@code department} 를 쓴다.
     */
    @Column(name = "employee_id")
    private Long employeeId;

    /**
     * 연간 휴가 부여일수. 휴가잔여일수현황의 '휴가일수' 열.
     * 소수 3자리 — 시간 단위 휴가가 0.125일(1시간) 단위로 쌓인다.
     */
    @Column(name = "annual_leave_days", nullable = false, precision = 6, scale = 3)
    @Builder.Default
    private java.math.BigDecimal annualLeaveDays = java.math.BigDecimal.valueOf(15);

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
