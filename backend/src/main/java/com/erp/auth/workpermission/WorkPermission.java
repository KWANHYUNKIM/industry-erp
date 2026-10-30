package com.erp.auth.workpermission;

import com.erp.auth.role.Role;
import com.erp.auth.user.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 업무 하나의 권한 — 사용자(개별권한) 또는 권한그룹(역할) 한쪽에 붙는다.
 * 사용자 줄이 있으면 기본권한 · 권한그룹보다 우선한다(원본 '예외 설정은 업무별 권한보다 항상 우선').
 *
 * <p>{@code menuRules} 는 예외(메뉴) — 줄마다 {@code /sales/list=N} 처럼 화면 경로와 진입 여부(Y/N).
 * 하위 메뉴 목록은 프론트 메뉴 표(FLAT_MENU × menuPermissions)가 단일 출처라 경로로 적는다.
 */
@Entity
@Table(name = "work_permissions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkPermission extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id")
    private Role role;

    @Column(name = "work_code", nullable = false, length = 50)
    private String workCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WorkPermissionMode mode;

    @Column(name = "can_create", nullable = false)
    @Builder.Default
    private boolean canCreate = true;

    @Column(name = "can_update", nullable = false)
    @Builder.Default
    private boolean canUpdate = true;

    @Column(name = "can_delete", nullable = false)
    @Builder.Default
    private boolean canDelete = true;

    @Column(name = "can_export", nullable = false)
    @Builder.Default
    private boolean canExport = true;

    @Column(name = "menu_rules", columnDefinition = "text")
    private String menuRules;
}
