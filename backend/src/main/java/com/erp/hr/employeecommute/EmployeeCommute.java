package com.erp.hr.employeecommute;

import com.erp.common.BaseTimeEntity;
import com.erp.hr.employee.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 출/퇴근기록부(사원)(원본 E020726) 한 줄 — 사원 · 일자 · 출근 · 퇴근 · 장소(내근/외근) · 오전반차 · 사유.
 * 사용자(ID) 단위인 그룹웨어 출/퇴근기록부와 달리 사원 단위다(로그인 계정이 없는 사원도 넣는다).
 */
@Entity
@Table(name = "employee_commutes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmployeeCommute extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Column(name = "clock_in", nullable = false)
    private LocalDateTime clockIn;

    @Column(name = "clock_out")
    private LocalDateTime clockOut;

    @Column(length = 50)
    private String place;

    @Column(nullable = false)
    private boolean outside;

    @Column(name = "morning_half", nullable = false)
    private boolean morningHalf;

    @Column(length = 200)
    private String reason;
}
