package com.erp.hr.insurance;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 사업장관리(원본 사업장관리등록 · 조회 창) — 4대보험 신고서의 사업장. 사업장관리번호는 11자리, 수정 때 막힌다. */
@Entity
@Table(name = "insurance_workplaces")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class InsuranceWorkplace extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "manage_no", nullable = false, length = 11)
    private String manageNo;

    @Column(length = 30)
    private String phone;

    @Builder.Default
    @Column(nullable = false)
    private boolean active = true;
}
