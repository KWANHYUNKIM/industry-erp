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

    @Column(length = 300)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
