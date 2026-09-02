package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

/**
 * 생산 공정 마스터 (생산관리 &gt; 공정등록).
 */
@Entity
@Table(name = "production_processes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProductionProcess extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 공정코드 (예: PRC-010) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 공정명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 작업장 */
    @Column(length = 100)
    private String workcenter;

    /** 표준시간(분) */
    @Column(nullable = false)
    @Builder.Default
    private Integer stdTimeMin = 0;

    /** 시간당 비용 */
    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal costPerHr = BigDecimal.ZERO;

    /**
     * 순번. 원본 공정등록의 [순번] 열.
     *
     * <p>공정은 흐름이라 <b>순서대로</b> 보여야 고르기 쉽다 — 반제품공정 → 완제품공정 →
     * 설치공정. 순번이 없으면 공정을 고르는 자리마다 코드순으로만 나온다.
     */
    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
