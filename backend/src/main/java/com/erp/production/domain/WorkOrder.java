package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Warehouse;

/**
 * 작업지시. 특정 제품을 지시수량만큼 생산하도록 계획.
 */
@Entity
@Table(name = "work_orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkOrder extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 지시번호 (예: WO-20260706-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String orderNo;

    /** 생산 제품 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Item product;

    /** 자재출고/완제품입고 창고 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    /** 지시수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal plannedQty;

    /** 생산완료 누계수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal producedQty = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private WorkOrderStatus status = WorkOrderStatus.PLANNED;

    @Column(nullable = false)
    private LocalDate orderDate;

    private LocalDate dueDate;

    /**
     * 납품처 — 원본 작업지시서입력 머리의 항목이고 작업지시서조회의 [거래처명] 열이다.
     *
     * <p>production → trade 는 새로 생기는 의존이지만 순환이 아니다.
     * trade 는 inventory 만 참조한다(CLAUDE.md 4.1 표를 함께 갱신했다).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private com.erp.trade.domain.BusinessPartner partner;

    /**
     * 담당자(hr.Employee)의 id. <b>@ManyToOne 을 쓰지 않는다.</b>
     *
     * <p>production 이 hr 을 참조하면 <b>hr → accounting → production</b> 과 맞물려
     * 순환이 된다(급여의 원천징수가 accounting 을, 표준원가가 production 의 BomService 를 본다).
     * 그래서 id 만 들고 이름은 화면이 사원 목록에서 붙인다 —
     * inventory.Warehouse 가 공정을, auth.User 가 사원을 드는 방식과 같다.
     */
    @Column(name = "employee_id")
    private Long employeeId;

    @Column(length = 300)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
