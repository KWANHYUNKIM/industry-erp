package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 기안서 결재선 한 단계. 지정된 결재자가 승인/반려한다.
 */
@Entity
@Table(name = "approval_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalLine extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false)
    private ApprovalDocument document;

    /** 결재 순번(1부터) */
    @Column(nullable = false)
    private int stepOrder;

    /** 결재자 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "approver_id", nullable = false)
    private User approver;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ApprovalLineStatus status = ApprovalLineStatus.PENDING;

    @Column(length = 300)
    private String comment;

    private LocalDateTime actedAt;
}
