package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 작업내역(작업실적). 공정별 양품/불량/작업시간 등 실제 작업 실적.
 */
@Entity
@Table(name = "work_results")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkResult extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 연결 작업지시 (선택) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "work_order_id")
    private WorkOrder workOrder;

    /** 입력된 공정명. 자유입력을 허용하므로 마스터에 없는 값도 들어올 수 있다. */
    @Column(nullable = false, length = 100)
    private String process;

    /** 공정명이 공정 마스터와 일치하면 연결된다. 마스터에 없는 자유입력이면 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "process_id")
    private ProductionProcess processMaster;

    /**
     * 투입자원 — 이 작업에 쓴 설비. 원본 작업내역입력 그리드의 [투입자원] 열.
     *
     * <p>자원등록의 [대상작업](공정)과 짝이다. 설비를 적어 두면 "이 공정을 어느 설비로
     * 얼마나 돌렸나" 를 되짚을 수 있다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resource_id")
    private ProductionResource resource;

    /**
     * 생산공장 — 이 작업이 이뤄진 곳. 원본 작업내역입력의 머리 항목이고
     * 작업내역조회·작업내역현황 두 화면의 열이기도 하다.
     *
     * <p>창고 마스터의 [구분]이 공장인 행을 가리킨다. 안 정하면 null 이다 —
     * 예전에 적어 둔 작업내역은 어느 공장인지 알 길이 없고, 공장을 안 쓰는 회사도 있다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private com.erp.inventory.domain.Warehouse warehouse;

    /** 작업자 */
    @Column(length = 50)
    private String worker;

    /** 양품수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal goodQty = BigDecimal.ZERO;

    /** 불량수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal defectQty = BigDecimal.ZERO;

    /** 작업시간(분) */
    @Column(nullable = false)
    @Builder.Default
    private Integer workTimeMin = 0;

    @Column(nullable = false)
    private LocalDate workDate;

    @Column(length = 300)
    private String note;
}
