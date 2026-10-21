package com.erp.hr.employee;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 인사카드 창 사원 한 명당 한 줄 — 원본 인사카드등록(2026-10-22 실측)의 [기본] 여권번호 · [신상정보] 신상명세서 · 추천인 · 보증보험 ·
 * [기타설정] 무주택자 여부 · [추가정보] 문자 · 숫자 · Y/N · 일자 · 코드 형식 1~3. 사원 본 표(employees)를 넓히지 않는 1:1 곁 표다.
 */
@Entity
@Table(name = "employee_profiles")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmployeeProfile extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id", nullable = false, unique = true)
    private Employee employee;

    @Column(name = "passport_no", length = 30)
    private String passportNo;

    @Column(name = "homeless", length = 1)
    private String homeless;

    @Column(name = "head_name", length = 50)
    private String headName;

    @Column(name = "head_relation", length = 50)
    private String headRelation;

    @Column(name = "resident_phone", length = 30)
    private String residentPhone;

    @Column(name = "family_origin", length = 50)
    private String familyOrigin;

    @Column(name = "domicile", length = 100)
    private String domicile;

    @Column(name = "resident_zip", length = 10)
    private String residentZip;

    @Column(name = "resident_address", length = 200)
    private String residentAddress;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "lunar", length = 1)
    private String lunar;

    @Column(name = "married", length = 1)
    private String married;

    @Column(name = "wedding_date")
    private LocalDate weddingDate;

    @Column(name = "disabled", length = 1)
    private String disabled;

    @Column(name = "health_acquired")
    private LocalDate healthAcquired;

    @Column(name = "health_lost")
    private LocalDate healthLost;

    @Column(name = "health_card_no", length = 50)
    private String healthCardNo;

    @Column(name = "pension_acquired")
    private LocalDate pensionAcquired;

    @Column(name = "pension_lost")
    private LocalDate pensionLost;

    @Column(name = "veteran", length = 1)
    private String veteran;

    @Column(name = "veteran_relation", length = 50)
    private String veteranRelation;

    @Column(name = "military_type", length = 30)
    private String militaryType;

    @Column(name = "military_branch", length = 30)
    private String militaryBranch;

    @Column(name = "military_unmet", length = 100)
    private String militaryUnmet;

    @Column(name = "military_rank", length = 30)
    private String militaryRank;

    @Column(name = "ref_name", length = 50)
    private String refName;

    @Column(name = "ref_relation", length = 50)
    private String refRelation;

    @Column(name = "ref_company", length = 100)
    private String refCompany;

    @Column(name = "ref_phone", length = 30)
    private String refPhone;

    @Column(name = "ref_duty", length = 50)
    private String refDuty;

    @Column(name = "ref_zip", length = 10)
    private String refZip;

    @Column(name = "ref_address", length = 200)
    private String refAddress;

    @Column(name = "bond_company", length = 100)
    private String bondCompany;

    @Column(name = "bond_no", length = 50)
    private String bondNo;

    @Column(name = "bond_phone", length = 30)
    private String bondPhone;

    @Column(name = "bond_amount", precision = 18, scale = 0)
    private BigDecimal bondAmount;

    @Column(name = "bond_from")
    private LocalDate bondFrom;

    @Column(name = "bond_to")
    private LocalDate bondTo;

    @Column(name = "text1", length = 100)
    private String text1;

    @Column(name = "text2", length = 100)
    private String text2;

    @Column(name = "text3", length = 100)
    private String text3;

    @Column(name = "num1", precision = 18, scale = 2)
    private BigDecimal num1;

    @Column(name = "num2", precision = 18, scale = 2)
    private BigDecimal num2;

    @Column(name = "num3", precision = 18, scale = 2)
    private BigDecimal num3;

    @Column(name = "yn1", length = 1)
    private String yn1;

    @Column(name = "yn2", length = 1)
    private String yn2;

    @Column(name = "yn3", length = 1)
    private String yn3;

    @Column(name = "date1")
    private LocalDate date1;

    @Column(name = "date2")
    private LocalDate date2;

    @Column(name = "date3")
    private LocalDate date3;

    @Column(name = "code1", length = 50)
    private String code1;

    @Column(name = "code2", length = 50)
    private String code2;

    @Column(name = "code3", length = 50)
    private String code3;

}
