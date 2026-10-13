package com.erp.accounting.journal;

import com.erp.accounting.account.Account;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 회계전표 분개 명세. 한 라인은 차변(debit) 또는 대변(credit) 한쪽만 채운다.
 */
@Entity
@Table(name = "journal_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JournalLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "entry_id", nullable = false)
    private JournalEntry entry;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal debit = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal credit = BigDecimal.ZERO;

    @Column(length = 300)
    private String description;

    @Column(name = "line_no", nullable = false)
    @Builder.Default
    private Integer lineNo = 1;

    /**
     * 줄의 [부서] — 원본 전표 인쇄에서 줄마다 적요 칸 위에 부서명이 찍힌다(2026-10-13 loginaa 26/10/13-5).
     * 장부 · 재무제표 · 경영자료가 이것으로 거른다. hr 를 참조하지 않으려 id 만 든다.
     */
    @Column(name = "department_id")
    private Long departmentId;

    /** 줄의 [프로젝트]. */
    @Column(name = "project_id")
    private Long projectId;
}
