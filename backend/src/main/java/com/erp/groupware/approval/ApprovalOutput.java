package com.erp.groupware.approval;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 기안서 [결재문서] › '전표 출력물' 로 붙인 출력물 하나(V515).
 * 원본(2026-10-30 loginaa): 판매현황 · 미판매현황 창에서 [적용] 하면 '출력물 [판매현황]2026/10/30 오전 10:27:44' 칩이 생긴다.
 */
@Entity
@Table(name = "approval_outputs")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalOutput {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false)
    private ApprovalDocument document;

    /** 칩 차례(붙인 차례) */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** 메뉴 이름 — 판매현황 · 미판매현황 */
    @Column(name = "menu_name", nullable = false, length = 50)
    private String menuName;

    /** 적용한 때 — 칩 글자 '[판매현황]2026/10/30 오전 10:27:44' */
    @Column(name = "applied_at", nullable = false)
    private LocalDateTime appliedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApprovalOutputMode mode;

    /** 얼린 사본(씻은 HTML). SNAPSHOT 이면 이것을 보여 준다. */
    @Column(columnDefinition = "text")
    private String html;

    /** 조회 조건. AUTO 면 이것으로 다시 조회한다. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> conditions;
}
