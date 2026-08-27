package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Warehouse;

/**
 * 생산불출. 작업(작업지시)에 투입하기 위해 자재를 창고에서 출고(불출)한 내역.
 */
@Entity
@Table(name = "material_issues")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MaterialIssue extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 불출 자재(품목) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 불출 창고 (선택) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    /**
     * 받는공장 — 자재가 도착하는 창고(구분이 '공장' 인 창고). 원본 [받는공장] 이다.
     *
     * <p>보내는창고에서 빼고 여기에 넣는다. 예전에는 이 칸이 없어 어디로 갔는지 알 수 없었고,
     * 재고도 아예 안 움직였다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "to_warehouse_id")
    private Warehouse toWarehouse;

    /** 연결 작업지시 (선택) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "work_order_id")
    private WorkOrder workOrder;

    /** 불출수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal qty;

    @Column(nullable = false)
    private LocalDate issueDate;

    /**
     * 담당자(hr.Employee)의 id. <b>@ManyToOne 을 쓰지 않는다.</b>
     *
     * <p>production 이 hr 을 참조하면 hr → accounting → production 과 맞물려 순환이 된다
     * (CLAUDE.md 4.1). 작업지시의 담당자와 같은 이유다 — 이름은 화면이 사원 목록에서 붙인다.
     */
    @Column(name = "employee_id")
    private Long employeeId;

    @Column(length = 300)
    private String note;
}
