package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 전자결재 기안서. 기안자가 작성하고 결재선(ApprovalLine)을 따라 순차 결재된다.
 */
@Entity
@Table(name = "approval_documents")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalDocument extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 기안서No. (예: AP-20260710-0002) */
    @Column(nullable = false, unique = true, length = 30)
    private String docNo;

    /** 기안No. 기안일자별 일련번호 (예: 2026/07/10-2) */
    @Column(nullable = false, unique = true, length = 30)
    private String draftNo;

    /** 양식. 예전 formType enum 을 대체한다. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "form_template_id", nullable = false)
    private ApprovalFormTemplate formTemplate;

    @Column(nullable = false, length = 200)
    private String title;

    @Lob
    @Column(nullable = false)
    private String content;

    /** 양식별 입력값. 키는 양식 마스터의 field_schema 가 정의한다. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "form_data", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> formData = new HashMap<>();

    /** 기안자 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "drafter_id", nullable = false)
    private User drafter;

    @Column(nullable = false)
    private LocalDate draftDate;

    /** 기안 부서 */
    @Column(length = 100)
    private String department;

    /** 관련 프로젝트. 미지정 허용. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ApprovalStatus status = ApprovalStatus.DRAFTING;

    /** 현재 결재 진행중인 단계(1부터). 완료/반려 시 마지막 처리 단계. */
    @Column(nullable = false)
    @Builder.Default
    private int currentStep = 1;

    /** 수신참조(콤마구분 이름) — 자유입력 잔재. 실제 참여자는 participants 를 쓴다. */
    @Column(length = 300)
    private String reference;

    /** 소프트 삭제. 목록의 '삭제' 탭이 이 값을 본다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean deleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("stepOrder asc")
    @Builder.Default
    private List<ApprovalLine> lines = new ArrayList<>();

    /** 수신참조 / 공유자 */
    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ApprovalParticipant> participants = new ArrayList<>();

    /** 연결된 ERP 전표 */
    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ApprovalDocumentVoucher> vouchers = new ArrayList<>();

    public void addLine(ApprovalLine line) {
        line.setDocument(this);
        this.lines.add(line);
    }

    public void addParticipant(ApprovalParticipant p) {
        p.setDocument(this);
        this.participants.add(p);
    }

    public void addVoucher(ApprovalDocumentVoucher v) {
        v.setDocument(this);
        this.vouchers.add(v);
    }

    /** 소프트 삭제 처리 */
    public void markDeleted() {
        this.deleted = true;
        this.deletedAt = LocalDateTime.now();
    }
}
