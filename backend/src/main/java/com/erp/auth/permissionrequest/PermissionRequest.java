package com.erp.auth.permissionrequest;

import com.erp.auth.user.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 권한요청 한 건 — 권한 없는 화면의 [권한요청] 이 만들고, 마스터가 권한승인대기현황에서 승인 · 반려한다.
 * 같은 사람 · 같은 업무의 대기 요청은 하나만 둔다(부분 UNIQUE uk_permission_requests_pending).
 */
@Entity
@Table(name = "permission_requests")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PermissionRequest extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_id", nullable = false)
    private User requester;

    @Column(name = "work_code", nullable = false, length = 50)
    private String workCode;

    /** 막힌 화면 경로 · 이름(메뉴). */
    @Column(name = "menu_path", length = 200)
    private String menuPath;

    @Column(name = "menu_name", length = 100)
    private String menuName;

    @Column(length = 500)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PermissionRequestStatus status;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "processed_by_id")
    private User processedBy;

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "approve_kind", length = 10)
    private ApproveKind approveKind;
}
