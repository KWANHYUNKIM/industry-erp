package com.erp.hr.attendance;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalTime;
import com.erp.auth.user.User;
import com.erp.common.BaseTimeEntity;

/**
 * 출/퇴근 기록. 사용자·일자당 1건.
 */
@Entity
@Table(name = "attendances",
        uniqueConstraints = @UniqueConstraint(name = "uk_attendance_user_date", columnNames = {"user_id", "work_date"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Attendance extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    private LocalTime clockIn;

    private LocalTime clockOut;

    /** 사유(원본 기록 창 [사유]) · 관리 근태입력의 적요. */
    @Column(length = 200)
    private String note;

    /** 장소 — 원본 기록 창의 처음 값 '사무실'(2026-10-14 실측). */
    @Column(length = 50)
    private String place;

    /** ☐외근 — 출/퇴근현황(ID) [내/외근구분] 이 이것으로 가른다. */
    @Column(name = "outside_work", nullable = false)
    private boolean outsideWork;

    /** ☐오전반차설정 — 켠 날은 지각으로 치지 않는다. */
    @Column(name = "half_leave", nullable = false)
    private boolean halfLeave;
}
