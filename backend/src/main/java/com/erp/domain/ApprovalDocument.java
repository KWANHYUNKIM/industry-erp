package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

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

    /** 문서번호 (예: AP-20260706-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String docNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApprovalFormType formType;

    @Column(nullable = false, length = 200)
    private String title;

    @Lob
    @Column(nullable = false)
    private String content;

    /** 기안자 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "drafter_id", nullable = false)
    private User drafter;

    @Column(nullable = false)
    private LocalDate draftDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ApprovalStatus status = ApprovalStatus.DRAFTING;

    /** 현재 결재 진행중인 단계(1부터). 완료/반려 시 마지막 처리 단계. */
    @Column(nullable = false)
    @Builder.Default
    private int currentStep = 1;

    /** 수신참조(콤마구분 이름) */
    @Column(length = 300)
    private String reference;

    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("stepOrder asc")
    @Builder.Default
    private List<ApprovalLine> lines = new ArrayList<>();

    public void addLine(ApprovalLine line) {
        line.setDocument(this);
        this.lines.add(line);
    }
}
