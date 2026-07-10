package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 업무일지. 직원이 일자별 업무 내용을 기록한다.
 */
@Entity
@Table(name = "work_journals")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkJournal extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 업무보고일 */
    @Column(nullable = false)
    private LocalDate reportDate;

    /** 작성자 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private User author;

    @Column(length = 50)
    private String department;

    /** 관련 거래처(자유 입력) */
    @Column(length = 100)
    private String partnerName;

    @Column(nullable = false, length = 200)
    private String title;

    @Lob
    @Column(nullable = false)
    private String content;
}
