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

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
