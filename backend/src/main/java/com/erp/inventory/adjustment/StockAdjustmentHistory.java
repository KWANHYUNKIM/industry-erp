package com.erp.inventory.adjustment;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 재고조정 이력 한 줄 — 원본 재고조정조회(E040614) [이력조회 ▴] 의 간편조정 이력조회 · 단계별조정 이력조회
 * (2026-10-13 loginaa 실측: 작업일자 · 전표번호 · 행위 신규/삭제 · 거래처 · 품목명 · 담당자 · 작업자).
 *
 * <p>지운 전표도 '삭제' 로 남아야 해서 조정 행과 FK 로 잇지 않는다.
 */
@Entity
@Table(name = "stock_adjustment_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StockAdjustmentHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "adjust_no", nullable = false, length = 30)
    private String adjustNo;

    @Column(name = "adjust_date", nullable = false)
    private LocalDate adjustDate;

    /** 간편 · 단계별 */
    @Column(nullable = false, length = 10)
    private String sort;

    /** 신규 · 삭제 */
    @Column(nullable = false, length = 10)
    private String action;

    @Column(name = "item_label", length = 300)
    private String itemLabel;

    @Column(name = "partner_id")
    private Long partnerId;

    @Column(name = "employee_id")
    private Long employeeId;

    @Column(length = 50)
    private String worker;

    @Column(name = "worked_at", nullable = false)
    private LocalDateTime workedAt;
}
