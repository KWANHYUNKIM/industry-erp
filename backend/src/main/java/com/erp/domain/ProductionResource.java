package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

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

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
