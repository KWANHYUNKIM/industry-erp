package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Project;
import com.erp.inventory.domain.Warehouse;

/**
 * 매출계획. 품목별 월 매출 목표(수량·금액).
 * 실적은 별도 저장하지 않고 판매(Sales) 집계로 대조한다(매출계획비교표).
 */
@Entity
@Table(name = "sales_plans")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SalesPlan extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /**
     * 원본 매출계획의 [창고]·[거래처]·[프로젝트].
     *
     * <p>셋 다 nullable 인데, 널은 <b>"그 축을 안 나눈다"</b>는 뜻이다 — 실적을 맞춰 셀 때
     * 그 축은 전부를 합친다. 창고를 고른 계획은 <b>그 창고에서 나간 판매만</b> 실적으로 센다.
     * 안 그러면 창고별로 계획을 쪼갠 순간 <b>같은 판매가 모든 줄에 중복으로</b> 잡혀
     * 달성률이 다 같이 부풀어 오른다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /** 계획 연도 (예: 2026) */
    /**
     * 담당자. 원본 매출계획비교표의 조건이다 — 창고·거래처·프로젝트와 <b>같은 성질의 축</b>이다.
     * 안 고르면 그 축을 안 나눈다(전부를 합친다).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private com.erp.hr.domain.Employee employee;

    @Column(name = "plan_year", nullable = false)
    private int planYear;

    /** 계획 월 (1~12) */
    @Column(name = "plan_month", nullable = false)
    private int planMonth;

    /** 계획 수량 */
    @Column(name = "plan_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planQty = BigDecimal.ZERO;

    /** 계획 금액 */
    @Column(name = "plan_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal planAmount = BigDecimal.ZERO;

    @Column(length = 300)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
