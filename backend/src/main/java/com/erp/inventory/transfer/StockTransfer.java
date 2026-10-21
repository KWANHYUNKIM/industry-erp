package com.erp.inventory.transfer;

import com.erp.inventory.item.Item;
import com.erp.inventory.project.Project;
import com.erp.inventory.warehouse.Warehouse;
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

    /**
     * 이동번호 (예: TR-20260707-0001). <b>전표 번호</b>다 — 원본 창고이동은 전표 한 장에 품목 여러 줄이라
     * 같은 전표의 줄들이 이 번호를 나눠 든다(V426, 이동번호 + 줄번호가 한 줄).
     */
    @Column(nullable = false, length = 30)
    private String transferNo;

    /** 전표 안 줄 차례(1부터). 일자 · 창고 · 프로젝트 · 담당자는 전표 머리라 줄마다 같은 값을 든다. */
    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

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
