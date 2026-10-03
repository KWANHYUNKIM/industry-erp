package com.erp.hr.attendancekind;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 휴가항목(원본 E020702 휴가항목등록) — 휴가코드 · 휴가명 · 기간(사용기간) · 이월 잔여일수 자동계산 · 적요.
 * 근태유형이 '휴가' 인 근태항목은 이 항목 하나를 [휴가코드]로 가리킨다.
 */
@Entity
@Table(name = "vacation_kinds")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class VacationKind extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    /** 이월 잔여일수 자동계산(원본 기본 '사용안함') */
    @Column(name = "carry_over", nullable = false)
    private boolean carryOver;

    @Column(length = 500)
    private String remark;

    @Column(nullable = false)
    private boolean active;
}
