package com.erp.accounting.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.domain.ProductionProcess;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 노무비/경비등록 한 줄 — 그 달 <b>공정·창고별로 실제 들어간</b> 노무비와 경비.
 *
 * <p>원본(이카운트) 원가생성/수정의 [사전작업] &gt; [노무비/경비등록] 에 해당한다
 * (사본 열 id: PLANT_DES·WH_CD·WH_DES·LABOR_XPNS·ETC_XPNT).
 *
 * <p>표준원가의 노무비는 공정 마스터의 시간당 비용으로 낼 수 있지만, <b>경비는 요율이 없다.</b>
 * 그래서 이 표가 없으면 경비를 지어내는 수밖에 없어 늘 0 이었다.
 * 여기 적힌 총액을 <b>표준 작업시간 비율</b>로 품목에 배부한다.
 */
@Entity
@Table(name = "process_expenses")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProcessExpense extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 기준년월 (yyyy-MM) */
    @Column(nullable = false, length = 7)
    private String period;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "process_id", nullable = false)
    private ProductionProcess process;

    /** 창고. 비워 두면 전사 공통이다 — 원본도 창고를 안 정할 수 있다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    @Column(name = "labor_cost", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal laborCost = BigDecimal.ZERO;

    @Column(name = "overhead_cost", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal overheadCost = BigDecimal.ZERO;

    @Column(length = 255)
    private String remark;
}
