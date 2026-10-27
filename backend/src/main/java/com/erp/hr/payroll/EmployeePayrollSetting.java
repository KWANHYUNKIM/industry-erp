package com.erp.hr.payroll;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 원본 사원등록(E090101) <b>[기타설정]</b> — 급여계산이 4대보험 · 소득세를 셈할 때 보는 사원별 값.
 *
 * <p>2026-10-13 loginaa 실측(변종호 2019-002, QA 대장 2026/10 -2 를 '이번 지급사항만으로 소득세 등 계산'으로 전체계산):
 * <ul>
 *   <li>처음 값: 건강보험 자동계산 · 장기요양 가입 · 국민연금 기준소득월액기준(3,800,000) · 고용보험 자동계산 ·
 *       배우자 공제대상아님 · 공제대상가족 빈칸 · 자녀수 빈칸 · 간이세액표 100%.</li>
 *   <li>국민연금은 급여(과세 4,038,000 → 4,114,000)가 바뀌어도 그대로였다 — 기준소득월액에 요율.</li>
 *   <li>건강 · 국민연금 · 고용 '안함' → 장기요양까지 네 칸이 빈다.</li>
 * </ul>
 * 사원 행이 없으면 처음 값과 같다(국민연금 기준소득월액이 비면 과세급여로 셈한다).
 */
@Entity
@Table(name = "employee_payroll_settings")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmployeePayrollSetting extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "employee_id", nullable = false, unique = true)
    private Long employeeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "health_mode", nullable = false, length = 10)
    @Builder.Default
    private InsuranceBasis healthMode = InsuranceBasis.AUTO;

    /** 건강보험 보수월액 — '보수월액기준' 일 때 칸이 보인다. 원본도 급여계산에 쓰지 않는다(실측). */
    @Column(name = "health_base_amount", precision = 18, scale = 2)
    private BigDecimal healthBaseAmount;

    /** 건강보험 증번호 */
    @Column(name = "health_card_no", length = 30)
    private String healthCardNo;

    /** 보험료경감 대상 — 장기요양보험료만 0.7 배(원본 실측 19,070 → 13,340) */
    @Column(name = "insurance_reduction", nullable = false)
    private boolean insuranceReduction;

    /** 장기요양보험가입여부 — 가입이면 건강보험료 × 장기요양 비율 */
    @Column(name = "long_term_care", nullable = false)
    @Builder.Default
    private boolean longTermCare = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "pension_mode", nullable = false, length = 10)
    @Builder.Default
    private InsuranceCalc pensionMode = InsuranceCalc.AUTO;

    /** 국민연금 기준소득월액. 비면 과세급여(상·하한 안)로 셈한다. */
    @Column(name = "pension_base_amount", precision = 18, scale = 2)
    private BigDecimal pensionBaseAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "employment_mode", nullable = false, length = 10)
    @Builder.Default
    private InsuranceBasis employmentMode = InsuranceBasis.AUTO;

    /** 고용보험 보수월액 — '보수월액기준' 일 때 */
    @Column(name = "employment_base_amount", precision = 18, scale = 2)
    private BigDecimal employmentBaseAmount;

    /** 배우자 공제 */
    @Column(name = "spouse_deduction", nullable = false)
    private boolean spouseDeduction;

    /** 공제대상가족(본인, 배우자 제외) 명 */
    @Column(nullable = false)
    private int dependents;

    /** 공제대상가족중 8세이상 20세이하 자녀수 */
    @Column(nullable = false)
    private int children;

    /** 간이세액표 적용방법 80 · 100 · 120 (%) */
    @Column(name = "tax_scale", nullable = false)
    @Builder.Default
    private int taxScale = 100;

    /** 종교관련종사자 여/부 — 급여 셈에 변화 없음(실측) */
    @Column(name = "religious_worker", nullable = false)
    private boolean religiousWorker;

    @Enumerated(EnumType.STRING)
    @Column(name = "household_type", nullable = false, length = 20)
    @Builder.Default
    private HouseholdType householdType = HouseholdType.HEAD;

    /** 무주택자 여부 — 여(무주택자) 면 true. 급여 셈에 변화 없음(실측) */
    @Column(nullable = false)
    private boolean homeless;

    /** 외국인 — 이것만으로는 급여 셈에 변화 없음(실측). 단일세율과 함께 쓴다 */
    @Column(nullable = false)
    private boolean foreigner;

    @Column(length = 50)
    private String nationality;

    /** 비거주자 — 급여 셈에 변화 없음(실측) */
    @Column(name = "non_resident", nullable = false)
    private boolean nonResident;

    @Column(name = "residence_country", length = 50)
    private String residenceCountry;

    /**
     * 단일세율(외국인근로자 19 %) — 소득세 = 지급총액(비과세 수당 포함) × 19 %, 4대보험 기준도 지급총액.
     * 원본 실측(외국인 · 단일세율): 4,138,000 → 소득세 786,220 · 지방 78,620 · 건강 148,760 · 고용 37,240.
     */
    @Column(name = "single_tax_rate", nullable = false)
    private boolean singleTaxRate;

    /** 국내파견 근로자(고소득) — 값만 둔다(재지 않음) */
    @Column(name = "domestic_dispatched", nullable = false)
    private boolean domesticDispatched;

    /** 간이세액표의 공제대상가족 수 — 본인 + 배우자 + 공제대상가족 */
    public int familyCount() {
        return 1 + (spouseDeduction ? 1 : 0) + dependents;
    }

    public static EmployeePayrollSetting defaults(Long employeeId) {
        return EmployeePayrollSetting.builder().employeeId(employeeId).build();
    }
}
