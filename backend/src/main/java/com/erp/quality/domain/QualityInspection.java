package com.erp.quality.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Project;
import com.erp.inventory.domain.Warehouse;
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

    /**
     * 원본 조건의 [창고]. 같은 품목이 창고 셋에 있으면 <b>어느 창고 것을 본 검사인지</b>
     * 알 수가 없었고, 불량률파악보고서에서 창고로 거를 수도 없었다.
     * 검사 시점에 안 정했을 수 있어 nullable 이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    /** 원본 조건의 [프로젝트]. 위와 같은 까닭으로 nullable 이다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;


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
