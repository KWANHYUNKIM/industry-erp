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

    /**
     * 불량의 갈래. 원본 불량률파악보고서의 <b>[불량유형]</b> — 공통코드 그룹 DEFECT_TYPE 의 코드다.
     *
     * <p>불량<b>수량</b>만 적으면 "이 품목은 불량률 8%" 까지는 말해도
     * <b>"그중 대부분이 치수불량"</b> 은 말할 수 없다. 불량률만 알면 고칠 데를 못 찾는다.
     *
     * <p>연관관계가 아니라 <b>코드 글자</b>다. 그래야 quality 가 settings 를 참조하지 않는다
     * (지금 settings 는 어느 모듈과도 안 엮여 있고, 그대로 두는 편이 낫다).
     * 불량이 없는 검사(전량 양품)에는 없다.
     */
    @Column(name = "defect_type", length = 50)
    private String defectType;

    @Column(length = 300)
    private String remark;
}
