package com.erp.accounting.tax.paymentstatement;

import com.erp.accounting.tax.simplepayment.SimplePaymentSubmitter;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 지급명세서파일생성 한 줄(원본 세무 › 원천징수 › 지급명세서 E030503). 국세청에 낼 전자파일을 만들 '설정' 만 든다 —
 * 금액은 들고 있지 않고, 전자파일 [생성] 때 자료를 읽는다(우리는 [생성] 을 잠가 두었다).
 * 신고구분은 원본이 늘 '정기신고'(연간합산제출)라 칸이 없다.
 */
@Entity
@Table(name = "payment_statement_files")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PaymentStatementFile extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 30)
    private PaymentStatementKind kind;

    @Column(name = "attr_year", nullable = false)
    private Integer attrYear;

    @Column(name = "attr_month", nullable = false)
    private Integer attrMonth;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;

    /** [중도정산] 포함(true) · 미포함 — 일괄생성 · 근로소득에만 보인다. */
    @Column(name = "mid_settlement", nullable = false)
    private Boolean midSettlement;

    @Enumerated(EnumType.STRING)
    @Column(name = "basis", nullable = false, length = 20)
    private PaymentStatementBasis basis;

    @Enumerated(EnumType.STRING)
    @Column(name = "other_income", nullable = false, length = 10)
    private PaymentStatementOtherIncome otherIncome;

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
