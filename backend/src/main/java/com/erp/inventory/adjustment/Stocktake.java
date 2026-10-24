package com.erp.inventory.adjustment;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 간편 재고실사 한 장 — 원본 재고실사조회(E040613)의 [구분] '간편' 줄.
 *
 * <p>2026-10-12 loginaa 실측: 간편재고조정을 하면 <b>실사와 조정이 따로 남는다</b>. 재고실사조회에
 * '간편 · 2026/10/12 -1 · 본사창고 · 포장김치[1KG] · 350.00 · 2026/10/12 -1'(조정전표), 재고조정조회에 조정 -2.
 * 조정을 지워도 실사는 [조정전표] 빈 채로 남고, 실사는 재고실사조회 [선택삭제]로 따로 지운다.
 * 그래서 조정이 지워지면 DB 가 {@link #adjustment} 만 비운다(ON DELETE SET NULL, V331).
 */
@Entity
@Table(name = "stocktakes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Stocktake extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 실사번호 (예: ST-20261012-0001). 원본 [입력일자] '2026/10/12 -1' 의 끝 번호. */
    @Column(name = "stocktake_no", nullable = false, length = 30, unique = true)
    private String stocktakeNo;

    @Column(name = "stocktake_date", nullable = false)
    private LocalDate stocktakeDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 실사수량 — 원본 [수량] '350.00'. */
    @Column(name = "actual_qty", nullable = false, precision = 18, scale = 2)
    private BigDecimal actualQty;

    /** 원본 [담당자] — 간편재고조정 창의 담당자. 비우면 빈칸(작성자가 아니다). */
    @Column(name = "employee_id")
    private Long employeeId;

    /** 이 실사로 맞춘 재고조정. 조정을 지우면 비는다 — 원본 [조정전표] 빈칸. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "adjustment_id")
    private StockAdjustment adjustment;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
