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

    /**
     * 예상매출일자. 원본 매출계획입력 머리의 날짜다.
     *
     * <p>계획은 달 단위지만 <b>그 달 안에서 언제쯤</b>인지는 달만으로 말할 수 없다.
     * 안 정할 수도 있다. 정하면 계획연월과 <b>어긋날 수 없다</b> — 어긋나면 어느 쪽이
     * 참인지 알 수 없는 줄이 남는다.
     */
    @Column(name = "expected_date")
    private java.time.LocalDate expectedDate;

    /**
     * 전표일자. 예상매출일자가 있으면 그것, 없으면 계획연월 1일이다.
     *
     * <p>원본 매출계획 격자의 첫 열이 <b>[일자-No.]</b> 라서 번호에 날짜가 붙는다.
     * 예상매출일자는 비어 있을 수 있는데 번호는 늘 있어야 하므로, 채번에 쓸 날짜를
     * 따로 둔다. 예상매출일자가 계획연월과 어긋나는 것은 서비스가 막으므로 둘이 갈라지지 않는다.
     */
    @Column(name = "plan_date", nullable = false)
    private java.time.LocalDate planDate;

    /** 전표번호 SP-yyyyMMdd-NNNN. 계획 한 줄을 가리킬 이름이다. */
    @Column(name = "plan_no", nullable = false, length = 30, unique = true)
    private String planNo;

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
