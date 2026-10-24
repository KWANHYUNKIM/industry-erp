package com.erp.groupware.approval;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.erp.common.BaseTimeEntity;

/**
 * 기안서 양식 마스터. (이카운트 '공통양식등록')
 * 사용자가 화면에서 양식을 추가/수정한다. 예전 ApprovalFormType enum 을 대체한다.
 */
@Entity
@Table(name = "approval_form_templates")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalFormTemplate extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 양식코드 (예: LEAVE, BIZ_TRIP) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 양식명 (예: 휴가신청서) */
    @Column(nullable = false, length = 100)
    private String name;

    /** 화면 정렬 순서 */
    @Column(nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /** 원본 입력화면설정 › 기본값설정 › [구분] — 기안서 구분(그룹) 코드. 비우면 구분 없음. */
    @Column(name = "group_code", length = 20)
    private String groupCode;

    /** 원본 [기안서확인시점설정] › 수신참조 확인시점. */
    @Enumerated(EnumType.STRING)
    @Column(name = "reference_view_timing", nullable = false, length = 10)
    @Builder.Default
    private ApprovalViewTiming referenceViewTiming = ApprovalViewTiming.DEFAULT;

    /** 원본 [기안서확인시점설정] › 공유문서 확인시점. */
    @Enumerated(EnumType.STRING)
    @Column(name = "share_view_timing", nullable = false, length = 10)
    @Builder.Default
    private ApprovalViewTiming shareViewTiming = ApprovalViewTiming.DEFAULT;

    /**
     * 원본 [사용자별권한] '대상자선택' — 사용자 id(글자) → ALLOW(사용허가) · DENY(사용불가).
     * 없는 사용자는 권한그룹(기본, 누구나 쓴다).
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "user_permissions", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, String> userPermissions = new java.util.LinkedHashMap<>();

    /** 이 사용자가 이 양식으로 기안할 수 있나(원본 사용불가면 기안서작성 양식 목록에서 빠진다). */
    public boolean usableBy(Long userId) {
        return userId == null || !"DENY".equals(userPermissions.get(String.valueOf(userId)));
    }

    /**
     * 양식별 입력 항목 정의. 프론트가 이걸 읽어 폼을 그린다.
     * 빈 배열이면 자유서식(본문 리치텍스트)만 쓴다.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_schema", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<Map<String, Object>> fieldSchema = new ArrayList<>();
}
