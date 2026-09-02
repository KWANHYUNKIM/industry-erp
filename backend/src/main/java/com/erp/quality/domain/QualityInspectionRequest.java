package com.erp.quality.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;

/**
 * 품질검사요청. 검사 전 '요청'을 품목·로트 단위로 관리한다.
 * 요청(REQUESTED) → 검사완료(INSPECTED)/취소(CANCELED). 미검사현황 = REQUESTED.
 */
@Entity
@Table(name = "quality_inspection_requests")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QualityInspectionRequest extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 30)
    private String requestNo;

    @Column(nullable = false)
    private LocalDate requestDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QualityInspectionType type;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @Column(length = 50)
    private String lotNo;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal requestQty = BigDecimal.ZERO;

    /** 검사요청 기한(선택) */
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private QualityRequestStatus status = QualityRequestStatus.REQUESTED;

    /**
     * 귀속 프로젝트. 원본 품질검사요청입력 격자의 [프로젝트].
     *
     * <p>검사에는 진작 있었는데 <b>요청에는 없었다.</b> 그래서 프로젝트를 걸어 요청해도
     * 그 값이 안 남고, 요청이 검사로 넘어갈 때 사람이 다시 골라야 했다 —
     * 안 고르면 프로젝트로 보는 화면에서 그 검사가 사라진다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private com.erp.inventory.domain.Project project;

    /**
     * 검사방법. 원본 품질검사요청입력의 <b>[검사방법]</b> — 전수 · 샘플링(사본 실측).
     *
     * <p>몇 개를 검사해 달라는 <b>수량</b>만 적으면, 검사자가 100개를 다 봐야 하는지
     * 몇 개만 봐도 되는지 알 수 없어 <b>요청서를 받고 되물어야</b> 한다.
     */
    @Column(name = "inspect_method", length = 10)
    private String inspectMethod;

    /**
     * 샘플링일 때의 비율(%). 원본도 [샘플링(%)] 옆에 이 칸을 둔다.
     * <b>전수에는 없다</b> — 다 보는데 비율을 적으면 무엇을 뜻하는지 알 수 없다.
     */
    @Column(name = "sample_percent", precision = 5, scale = 2)
    private java.math.BigDecimal samplePercent;

    @Column(length = 50)
    private String requester;

    @Column(length = 300)
    private String remark;
}
