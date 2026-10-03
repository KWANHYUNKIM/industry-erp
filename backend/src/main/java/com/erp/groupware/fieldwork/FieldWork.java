package com.erp.groupware.fieldwork;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalTime;
import com.erp.auth.user.User;
import com.erp.common.BaseTimeEntity;

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

    /** 원본 [도착지 주소]. 비워 둘 수 있다(원본 필수는 사용자·이동수단뿐). */
    @Column(length = 200)
    private String destination;

    /** 원본 [적요]. */
    @Column(length = 300)
    private String purpose;

    /** 원본 [출발지 주소]. */
    @Column(length = 200)
    private String departure;

    /** 원본 [이동수단] 코드 — 차량번호(123하1234). 차량 마스터가 없어 글자로 받는다. */
    @Column(name = "vehicle_no", length = 30)
    private String vehicleNo;

    /** 원본 [이동수단명] — 차량명(k5[H]). */
    @Column(name = "vehicle_name", length = 100)
    private String vehicleName;

    /** 원본 [사용목적명]. */
    @Column(name = "use_purpose", length = 100)
    private String usePurpose;

    /** 원본 격자 [운행거리](500.00). */
    @Column(precision = 12, scale = 2)
    private java.math.BigDecimal distance;

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
