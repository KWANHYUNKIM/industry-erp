package com.erp.accounting.expense;

import com.erp.accounting.account.Account;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.project.Project;
import com.erp.trade.partner.BusinessPartner;

/**
 * 비용(지출) 내역. (회계 > 비용관리)
 */
@Entity
@Table(name = "expenses")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Expense extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate expenseDate;

    /** 지출 계정과목 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    /** 적요 */
    @Column(length = 300)
    private String content;

    /**
     * 비용 전표번호 (EX-yyyyMMdd-####).
     *
     * <p>원본 비용내역현황의 첫 열이 [일자-No.] 다. 번호가 없으면 "그 비용 건" 을 지목할
     * 방법이 없어, 증빙을 붙이거나 회계반영을 되짚을 때 일자와 금액으로 더듬어야 한다.
     */
    @Column(name = "doc_no", nullable = false, unique = true, length = 30)
    private String docNo;

    /** 거래처(자유입력) */
    @Column(length = 200)
    private String partnerName;

    /**
     * 거래처 마스터 연결. 자유입력을 허용하되, 이름이 마스터와 정확히 일치하면 여기에 채운다.
     * 일치하지 않으면 null 이고 입력한 문자열(partnerName)은 그대로 남는다 —
     * 마스터에 없는 상대에게도 돈은 나간다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /**
     * 부가세(매입세액). 세금계산서를 받은 비용이면 공급가액의 10%. 낸 돈 = amount + vatAmount.
     * 분개에서 부가세대급금(135)으로 갈라 매입세액 공제를 받는다(46회차 — 칸이 없어 전액이 비용이었다).
     */
    @Builder.Default
    @Column(name = "vat_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal vatAmount = BigDecimal.ZERO;

    /** 결제수단 (법인카드/계좌이체/현금 등) */
    @Column(length = 30)
    private String paymentMethod;

    /** 부서 */
    @Column(length = 50)
    private String department;

    @Column(length = 50)
    private String createdBy;

    /** 원본 줄의 [사용일자]. 비면 기준일자(expenseDate)와 같은 날이다(V326 전 전표). */
    @Column(name = "use_date")
    private LocalDate useDate;

    /** 원본 머리의 [비고] — 줄의 [적요](content)와 따로다. */
    @Column(length = 200)
    private String remarks;

    /** 원본 머리의 [결제구분] — 개인비용 · 회사비용. 결제수단(paymentMethod)과 다르다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "pay_type", length = 10)
    private ExpensePayType payType;

    /** 귀속 프로젝트. 없으면 일반 영업·간접비다 (억지로 채우면 프로젝트 손익이 거짓말을 한다). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /**
     * 원본 비용내역입력 줄의 [비용코드](비용 마스터, E060809). 비면 옛 지출 등록(계정을 바로 고른 것)이다 —
     * 그 자료는 계정만 있어 비용 마스터로 옮길 수 없다(V413).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_item_id")
    private com.erp.accounting.expenseitem.ExpenseItem expenseItem;

    /** 줄의 [사원](필수) — 사원 id 만 든다(accounting 은 hr 엔티티를 새로 참조하지 않는다, CLAUDE.md 4.1). */
    @Column(name = "employee_id")
    private Long employeeId;

    /** 머리의 [비용그룹] */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_group_id")
    private com.erp.accounting.expensegroup.ExpenseGroup expenseGroup;

    /** 전표별회계반영(E060814)이 만든 가지급금정산서(회계전표) id. 비용내역을 지우면 그 전표도 지운다. */
    @Column(name = "settled_journal_id")
    private Long settledJournalId;
}
