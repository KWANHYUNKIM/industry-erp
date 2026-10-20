package com.erp.groupware.workjournal;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 업무일지 조회 기록 — 원본 '조회' 창 [R] '조회자 현황'(2026-10-20 E070304 실측)의 오른쪽 격자
 * (이름 · 최초조회일시 · 최종조회일시). 글쓴이 자신이 연 것은 적지 않는다(원본: 작성자가 열어도 조회자가 비어 있다).
 */
@Entity
@Table(name = "work_journal_views")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkJournalView {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "journal_id", nullable = false)
    private Long journalId;

    @Column(nullable = false, length = 50)
    private String username;

    @Column(name = "first_viewed_at", nullable = false)
    private LocalDateTime firstViewedAt;

    @Column(name = "last_viewed_at", nullable = false)
    private LocalDateTime lastViewedAt;
}
