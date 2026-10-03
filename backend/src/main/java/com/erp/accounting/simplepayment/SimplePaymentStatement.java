package com.erp.accounting.simplepayment;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 간이지급명세서 한 장(원본 E030116). 금액은 들고 있지 않다 — [조회] 때마다 근로소득은 급여명세에서,
 * 사업 · 기타소득은 기타원천세에서 센다. period 는 근로소득이면 반기(1 상반기 · 2 하반기), 그 밖에는 달(1~12).
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
}
