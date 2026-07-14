package com.erp.domain;

import com.erp.domain.enums.FieldWorkStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * 외근계. 사무실 밖에서 일한 시간을 신청하고 승인받는다.
 *
 * 근태(Attendance)와 나란히 놓인다. 출퇴근 기록이 없는 날에 외근이 승인돼 있으면
 * 무단결근이 아니라 외근이다 — 그 판단을 사람이 매번 하지 않도록 외근조회에서 함께 본다.
 */
@Entity
@Table(name = "field_works")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FieldWork extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    /** 외근지 (거래처명·현장명) */
    @Column(nullable = false, length = 200)
    private String destination;

    /** 외근 사유 */
    @Column(nullable = false, length = 300)
    private String purpose;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private FieldWorkStatus status = FieldWorkStatus.REQUESTED;

    /** 승인·반려한 사람 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approver_id")
    private User approver;

    /** 반려 사유 */
    @Column(name = "reject_reason", length = 300)
    private String rejectReason;
}
