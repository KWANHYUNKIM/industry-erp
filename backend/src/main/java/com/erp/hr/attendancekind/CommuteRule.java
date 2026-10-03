package com.erp.hr.attendancekind;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 출/퇴근반영기준(원본 E020725) — 출퇴근 기록을 근태로 옮길 때의 규칙. 반영기준코드는 사람이 적는다(원본도 빈 칸).
 * 제외시간은 'D|HH:MM' 꼴(D = 0 당일 · 1 익일)로 시작 · 끝을 셋까지 담는다.
 */
@Entity
@Table(name = "commute_rules")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CommuteRule extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "hour_unit", nullable = false)
    private boolean hourUnit;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CommuteRuleMethod method;

    /** 적용기준 — true 직접설정, false 근무시간설정기준(원본 기본) */
    @Column(name = "direct_basis", nullable = false)
    private boolean directBasis;

    @Column(name = "min_hours")
    private Integer minHours;

    @Column(name = "min_minutes")
    private Integer minMinutes;

    @Column(name = "ex1_from", length = 8) private String ex1From;
    @Column(name = "ex1_to", length = 8) private String ex1To;
    @Column(name = "ex2_from", length = 8) private String ex2From;
    @Column(name = "ex2_to", length = 8) private String ex2To;
    @Column(name = "ex3_from", length = 8) private String ex3From;
    @Column(name = "ex3_to", length = 8) private String ex3To;

    @Column(length = 500)
    private String remark;

    @Column(nullable = false)
    private boolean active;
}
