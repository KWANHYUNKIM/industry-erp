package com.erp.hr.employeecommute;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 출/퇴근기록부(사원) 창 오른쪽 이력 한 줄 — '▸ [출근 10/12 오전 9:24]'. 원본 2026-10-13 실측: 사원 · 일자당 줄(EmployeeCommute)은
 * 하나이고 그 안에 출근 · 퇴근이 번갈아 쌓인다. 펼치면 출근은 장소 · □외근 · 시간 · □오전반차설정 · 사유 [저장],
 * 퇴근은 장소 · □오후반차설정 · 퇴근 · 사유 [저장] [삭제]. halfDay 는 출근이면 오전반차, 퇴근이면 오후반차.
 */
@Entity
@Table(name = "employee_commute_events")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmployeeCommuteEvent extends BaseTimeEntity {

    public static final String IN = "IN";
    public static final String OUT = "OUT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "commute_id")
    private EmployeeCommute commute;

    /** IN = 출근, OUT = 퇴근 */
    @Column(nullable = false, length = 3)
    private String kind;

    @Column(nullable = false)
    private LocalDateTime at;

    @Column(length = 50)
    private String place;

    @Column(nullable = false)
    private boolean outside;

    @Column(name = "half_day", nullable = false)
    private boolean halfDay;

    @Column(length = 200)
    private String reason;

    /** [H] 출퇴근이력보기 — 처음 넣은 / 마지막으로 고친 로그인 아이디 */
    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;

    public boolean isIn() {
        return IN.equals(kind);
    }
}
