package com.erp.accounting.fundplan;

import com.erp.accounting.account.Account;
import com.erp.accounting.bankcard.BankAccount;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.project.Project;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 회계 II &gt; 자금계획 — <b>계획전표</b> 한 장(원본 E020511, 2026-10-12 loginaa 실측).
 * 앞으로 들어오거나 나갈 돈의 계획. 계획전표현황 달력 · 추정자금일보가 이것으로 계좌 잔액을 내다본다.
 * 부서는 hr 모듈이라 id 만 든다.
 */
@Entity
@Table(name = "fund_plans")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FundPlan extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private FundPlanDirection direction;

    @Column(name = "plan_date", nullable = false)
    private LocalDate planDate;

    @Column(name = "department_id")
    private Long departmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private FundPlanMethod method;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bank_account_id")
    private BankAccount bankAccount;

    /** 원본 [관리번호(어음번호)] — 입력구분 '어음'일 때. */
    @Column(name = "note_no", length = 50)
    private String noteNo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "counter_account_id")
    private Account counterAccount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(length = 300)
    private String memo;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;
}
