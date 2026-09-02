package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

/**
 * 생산 자원 마스터 (생산관리 &gt; 자원등록) — 설비·인력·외주.
 */
@Entity
@Table(name = "production_resources")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProductionResource extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 자원코드 (예: RES-001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 자원명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 구분: 설비 / 인력 / 외주 */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String type = "설비";

    /** 가용능력 */
    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal capacity = BigDecimal.ZERO;

    /** 단위 (예: 시간/일, 개/일) */
    @Column(length = 20)
    private String unit;

    /** 시간당 비용 */
    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal costPerHr = BigDecimal.ZERO;

    /**
     * 위치 — 그 설비가 있는 창고. 원본 자원등록의 [위치] 열(MT0_WH).
     * 비워 둘 수 있다(아직 자리를 안 정한 설비).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private com.erp.inventory.domain.Warehouse warehouse;

    /**
     * 대상작업 — 이 설비로 하는 공정. 원본 [대상작업] 열(MT0_JOB).
     * BOR 의 작업이 그 공정을 가리키므로, 이 값이 있어야 "이 작업은 어느 설비로 하나" 에 답한다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "process_id")
    private ProductionProcess process;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
