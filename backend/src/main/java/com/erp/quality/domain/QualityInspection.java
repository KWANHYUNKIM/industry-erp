package com.erp.quality.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Lot;

/**
 * 품질검사 성적. 수입/공정/출하 검사 결과를 품목·로트 단위로 기록.
 */
@Entity
@Table(name = "quality_inspections")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QualityInspection extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 검사번호 (예: QC-20260707-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String inspectionNo;

    @Column(nullable = false)
    private LocalDate inspectionDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QualityInspectionType type;

    /** 검사 대상 품목 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(length = 50)
    private String lotNo;

    /** 입력한 lotNo가 등록된 로트와 일치하면 연결된다. 미등록 로트면 null이고 lotNo 문자열만 남는다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lot_id")
    private Lot lot;

    /** 검사수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal inspectedQty;

    /** 불량수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal defectQty = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QualityResult result;

    @Column(length = 50)
    private String inspector;

    @Column(length = 300)
    private String remark;
}
