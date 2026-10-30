package com.erp.auth.role;

import jakarta.persistence.*;
import lombok.*;


/**
 * 권한그룹(원본 Self-Customizing › 사용자관리 › 권한그룹 설정). name = 권한코드, displayName = 권한명.
 * Spring Security 에서는 "ROLE_" + name 형태의 권한으로 매핑된다.
 * <p>
 * <b>ADMIN 은 그룹이 아니라 마스터 표시</b>다 — ADMIN 역할을 가진 사용자가 마스터(관리자설정)이고 전권이다.
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

    // 업무권한은 work_permissions(role_id) 가 든다(WorkPermissionService). 옛 role_permissions 표는 V516 이 옮기고 더는 읽지 않는다.
}
