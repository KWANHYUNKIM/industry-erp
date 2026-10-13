package com.erp.hr.payroll;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 원본 공제항목등록 Option › <b>세율/세액등록</b> — 회사가 정한 그 해 4대보험 근로자 부담 요율.
 * 줄이 없는 해는 법정 요율({@link SocialInsuranceRates})을 쓴다.
 * 장기요양은 건강보험료(10원 버림 전 산출액)에 곱하는 비율이다.
 */
@Entity
@Table(name = "social_insurance_rates")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SocialInsuranceRate extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "rate_year", nullable = false)
    private Integer rateYear;

    @Column(name = "pension_rate", nullable = false, precision = 8, scale = 6)
    private BigDecimal pensionRate;

    @Column(name = "health_rate", nullable = false, precision = 8, scale = 6)
    private BigDecimal healthRate;

    @Column(name = "long_term_care_rate", nullable = false, precision = 8, scale = 6)
    private BigDecimal longTermCareRate;

    @Column(name = "employment_rate", nullable = false, precision = 8, scale = 6)
    private BigDecimal employmentRate;
}
