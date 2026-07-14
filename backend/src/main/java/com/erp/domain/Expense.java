package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

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

    /** 결제수단 (법인카드/계좌이체/현금 등) */
    @Column(length = 30)
    private String paymentMethod;

    /** 부서 */
    @Column(length = 50)
    private String department;

    @Column(length = 50)
    private String createdBy;

    /** 귀속 프로젝트. 없으면 일반 영업·간접비다 (억지로 채우면 프로젝트 손익이 거짓말을 한다). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;
}
