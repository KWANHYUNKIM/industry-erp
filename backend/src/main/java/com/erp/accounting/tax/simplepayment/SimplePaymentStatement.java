package com.erp.accounting.tax.simplepayment;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 간이지급명세서 한 장(원본 E030116). period 는 근로소득이면 반기(1 상반기 · 2 하반기), 그 밖에는 달(1~12).
 *
 * <p>사업 · 기타소득은 만들 때 그 달 기타원천세를 소득자 줄로 묶어 {@link #sheetSnapshot} 에 담아 두고,
 * [조회] 는 그것을 보인다 — 원본도 만든 뒤 넣은 기타원천세는 [새로불러오기] 를 눌러야 서식에 들어온다(2026-10-14 실측:
 * 1,000,000 으로 만든 뒤 200,000 을 더 넣어도 1,000,000, [새로불러오기] 뒤 1,200,000 이 저장되어 다시 열어도 그대로).
 * 근로소득 · 일용근로소득은 [조회] 때마다 급여명세 · 출역에서 센다.
 */
@Entity
@Table(name = "simple_payment_statements")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SimplePaymentStatement extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 20)
    private SimplePaymentKind kind;

    @Column(name = "pay_year", nullable = false)
    private Integer payYear;

    @Column(name = "period", nullable = false)
    private Integer period;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;

    @Column(name = "manager_dept", nullable = false, length = 100)
    private String managerDept;

    @Column(name = "manager_name", nullable = false, length = 100)
    private String managerName;

    @Column(name = "manager_phone", nullable = false, length = 50)
    private String managerPhone;

    @Enumerated(EnumType.STRING)
    @Column(name = "submitter", nullable = false, length = 10)
    private SimplePaymentSubmitter submitter;

    /** 사업 · 기타소득 서식의 소득자 줄(JSON) — 만들 때와 [새로불러오기] 때 다시 센다. 근로 · 일용은 null. */
    @Column(name = "sheet_snapshot", columnDefinition = "text")
    private String sheetSnapshot;
}
