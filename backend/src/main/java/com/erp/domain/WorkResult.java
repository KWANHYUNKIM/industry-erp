package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 작업내역(작업실적). 공정별 양품/불량/작업시간 등 실제 작업 실적.
 */
@Entity
@Table(name = "work_results")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkResult extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 연결 작업지시 (선택) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "work_order_id")
    private WorkOrder workOrder;

    /** 공정명 (공정 마스터명과 매칭) */
    @Column(nullable = false, length = 100)
    private String process;

    /** 작업자 */
    @Column(length = 50)
    private String worker;

    /** 양품수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal goodQty = BigDecimal.ZERO;

    /** 불량수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal defectQty = BigDecimal.ZERO;

    /** 작업시간(분) */
    @Column(nullable = false)
    @Builder.Default
    private Integer workTimeMin = 0;

    @Column(nullable = false)
    private LocalDate workDate;

    @Column(length = 300)
    private String note;
}
