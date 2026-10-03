package com.erp.hr.attendancekind;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 근태항목(원본 E020701 근태항목등록). 근태입력의 [근태항목]이 이 목록에서 고른다(근태 줄에는 이름이 남는다).
 * 계산단위 true = 시간, false = 일.
 */
@Entity
@Table(name = "attendance_kinds")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AttendanceKind extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, unique = true, length = 20)
    private String name;

    @Column(name = "kind_group", length = 50)
    private String kindGroup;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AttendanceKindType type;

    /** 근태유형이 '휴가' 일 때 원본 [휴가코드](휴가항목) — 꼭 고른다 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vacation_kind_id")
    private VacationKind vacationKind;

    @Column(name = "hour_unit", nullable = false)
    private boolean hourUnit;

    @Column(length = 500)
    private String remark;

    @Column(nullable = false)
    private boolean active;
}
