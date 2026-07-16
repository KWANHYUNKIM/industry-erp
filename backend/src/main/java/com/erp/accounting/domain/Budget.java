package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

/**
 * 예산. 계정과목 하나에 대한 한 달치 편성액이다.
 *
 * 집행실적은 따로 저장하지 않는다. 회계전표(journal_lines)에서 그 달·그 계정의 금액을 집계해
 * 쓰기 때문에, 전표를 고치면 집행률이 자동으로 따라온다. 실적을 복제해 두면 반드시 어긋난다.
 */
@Entity
@Table(name = "budgets",
        uniqueConstraints = @UniqueConstraint(name = "uk_budgets_period_account",
                columnNames = {"period", "account_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Budget extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 예산 귀속월 (YYYY-MM) */
    @Column(nullable = false, length = 7)
    private String period;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    /** 편성액 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
