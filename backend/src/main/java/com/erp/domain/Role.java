package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 사용자 역할(권한 그룹).
 * 예: ADMIN(관리자), MANAGER(매니저), STAFF(사원)
 * Spring Security 에서는 "ROLE_" + name 형태의 권한으로 매핑된다.
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
}
