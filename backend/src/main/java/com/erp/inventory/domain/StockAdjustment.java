package com.erp.inventory.domain;

import com.erp.inventory.domain.enums.StockAdjustmentType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 기타이동(자가사용·불량처리·재고조정) 전표.
 * 실제 재고 증감은 StockService.applyDelta 가 처리하고, 여기에는 처리 전/후 잔량을 함께 남긴다.
 * quantityChange 는 부호 있는 변동량(차감이면 음수)이라 조회 화면에서 방향을 그대로 읽을 수 있다.
 */
@Entity
@Table(name = "stock_adjustments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StockAdjustment extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: SA-20260714-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String adjustNo;

    @Column(nullable = false)
    private LocalDate adjustDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StockAdjustmentType type;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    /** 처리 전 잔량 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal beforeQty;

    /** 부호 있는 변동량 (자가사용·불량처리는 항상 음수) */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantityChange;

    /** 처리 후 잔량 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal afterQty;


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

    /**
     * 원본 <b>[불량유형]</b>·<b>[처리방법]</b>·<b>[사용유형]</b>.
     *
     * <p>세 이름이지만 <b>유형이 다른 화면의 같은 자리</b>다 — 불량처리·대체사용·폐기는
     * [불량유형]을, 자가사용은 [사용유형]을 묻는다. 그래서 칸 하나(<code>kind</code>)로 두고
     * 화면이 유형에 맞는 <b>이름표와 고를 값</b>을 붙인다. 칸을 셋 만들면 한 전표에 늘 둘이
     * 비어 있고, 유형을 바꿀 때 어느 칸을 지워야 하는지가 규칙이 된다.
     *
     * <p>고를 값은 <b>공통코드</b>에서 온다(settings). 재고는 아무 모듈도 참조하지 않는
     * 기반층이라 여기서는 <b>고른 값의 글자</b>만 든다 — 화면이 목록을 가져와 고르게 한다.
     */
    @Column(length = 30)
    private String kind;

    /** 원본 <b>[처리방법]</b>(불량처리) — 불량을 어떻게 했나(폐기·재작업·반품). */
    @Column(name = "handling", length = 30)
    private String handling;

    @Column(length = 50)
    private String createdBy;
}
