package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 창고 간 재고이동 헤더. 출고창고에서 입고창고로 품목을 이동한 기록.
 * 실제 재고 증감은 StockService.applyDelta(출고 -, 입고 +)로 처리된다.
 */
@Entity
@Table(name = "stock_transfers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StockTransfer extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 이동번호 (예: TR-20260707-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String transferNo;

    @Column(nullable = false)
    private LocalDate transferDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "from_warehouse_id", nullable = false)
    private Warehouse fromWarehouse;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "to_warehouse_id", nullable = false)
    private Warehouse toWarehouse;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;


    /** 원본 조건의 [프로젝트]. 어느 프로젝트로 옮겼는지 적을 데가 없어 [적요]에 손으로 적고 있었다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /**
     * 원본 조건의 [담당자]. <b>사원 테이블을 걸지 않고 id 만</b> 든다 —
     * inventory 는 기반층이라 hr 을 참조하면 hr → accounting → production 과 맞물려
     * 순환이 된다(CLAUDE.md 4.1). 작업지시·생산입고가 이미 같은 방식이다.
     */
    @Column(name = "employee_id")
    private Long employeeId;

    @Column(length = 300)
    private String reason;

    @Column(length = 50)
    private String createdBy;
}
