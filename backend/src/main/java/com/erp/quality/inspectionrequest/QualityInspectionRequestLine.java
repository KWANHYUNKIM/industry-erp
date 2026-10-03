package com.erp.quality.inspectionrequest;

import com.erp.inventory.item.Item;
import com.erp.quality.inspection.InspectionMethod;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.*;

/** 품질검사요청 품목 줄 — 원본 격자 [검사방법 · 품목코드 · 품목명 · 규격 · 수량](2026-10-04 실측). */
@Entity
@Table(name = "quality_inspection_request_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QualityInspectionRequestLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "request_id")
    private QualityInspectionRequest request;

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
}
