package com.erp.quality.inspection;

import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.*;

/**
 * 품질검사 품목 줄 — 원본 격자 [검사방법 · 품목코드 · 품목명 · 수량 · 시료 · 적격 · 부적격 · 합격여부](2026-10-04 실측).
 * 적격은 따로 적지 않는다 — 원본도 <b>시료 − 부적격</b>으로 셈한다(시료 3 · 부적격 1 → 적격 2).
 */
@Entity
@Table(name = "quality_inspection_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QualityInspectionLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inspection_id")
    private QualityInspection inspection;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private Item item;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InspectionMethod method;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal quantity;

    @Column(name = "sample_qty", nullable = false, precision = 18, scale = 2)
    private BigDecimal sampleQty;

    @Column(name = "defect_qty", nullable = false, precision = 18, scale = 2)
    private BigDecimal defectQty;

    @Enumerated(EnumType.STRING)
    @Column(name = "pass_result", nullable = false, length = 20)
    private InspectionPass passResult;

    /** 원본 [부적격관리]의 불량유형(공통코드 DEFECT_TYPE) — 원본은 유형마다 수량을 나누는데 우리는 주된 유형 하나를 든다. */
    @Column(name = "defect_type", length = 50)
    private String defectType;
}
