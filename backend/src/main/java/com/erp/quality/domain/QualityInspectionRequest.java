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

    @Column(length = 50)
    private String requester;

    @Column(length = 300)
    private String remark;
}
