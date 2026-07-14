package com.erp.domain;

import com.erp.domain.enums.CashFlowType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 자금수지계획. 한 달에 들어올 돈(수입)과 나갈 돈(지출)을 항목별로 미리 잡아둔다.
 *
 * 실적은 저장하지 않는다. 그 달의 계좌 입출금(bank_transactions)을 집계해 계획과 대조하므로,
 * 실제 자금이 움직이면 수지표가 저절로 갱신된다.
 */
@Entity
@Table(name = "cash_plans")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CashPlan extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 계획 귀속월 (YYYY-MM) */
    @Column(nullable = false, length = 7)
    private String period;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CashFlowType type;

    /** 자금 항목명 (예: 매출대금 회수, 급여 지급, 임차료) */
    @Column(nullable = false, length = 100)
    private String category;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
