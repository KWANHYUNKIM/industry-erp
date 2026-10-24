package com.erp.accounting.budget;

import com.erp.accounting.account.Account;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 예산 한 건 — 원본 회계 II › 예산관리(E020201, 2026-10-14 loginaa 실측) 와 같은 모양:
 * <b>기준년도 × 계정 × 부서 × 프로젝트</b> 하나에 1~12월 금액 12칸과 적요.
 * 부서 · 프로젝트가 비면(null) 원본 '[00]기타' 다.
 *
 * <p>실적은 저장하지 않는다 — 출력물이 볼 때 회계전표(journal_lines)에서 그 달 · 그 계정 금액을 모은다.
 * 부서는 hr 모듈이라 id 만 든다(CLAUDE.md 4.1 — accounting→hr 간선을 늘리지 않는다). 프로젝트도 이름은 화면이 붙인다.
 * 금액을 0 으로 고쳐도 줄은 남는다(원본도 줄을 지우는 단추가 없다 — 0 줄이 그대로 남는다).
 */
@Entity
@Table(name = "budget_plans")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BudgetPlan extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "fiscal_year", nullable = false)
    private Integer fiscalYear;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Column(name = "department_id")
    private Long departmentId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(length = 300)
    private String remark;

    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m01 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m02 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m03 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m04 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m05 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m06 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m07 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m08 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m09 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m10 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m11 = BigDecimal.ZERO;
    @Column(nullable = false, precision = 18, scale = 2) @Builder.Default private BigDecimal m12 = BigDecimal.ZERO;

    /** 1~12월 금액(0 번째 = 1월). */
    public List<BigDecimal> months() {
        return new ArrayList<>(List.of(m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12));
    }

    public void setMonths(List<BigDecimal> v) {
        BigDecimal[] a = new BigDecimal[12];
        for (int i = 0; i < 12; i++) a[i] = v != null && i < v.size() && v.get(i) != null ? v.get(i) : BigDecimal.ZERO;
        m01 = a[0]; m02 = a[1]; m03 = a[2]; m04 = a[3]; m05 = a[4]; m06 = a[5];
        m07 = a[6]; m08 = a[7]; m09 = a[8]; m10 = a[9]; m11 = a[10]; m12 = a[11];
    }

    public BigDecimal total() {
        return months().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
