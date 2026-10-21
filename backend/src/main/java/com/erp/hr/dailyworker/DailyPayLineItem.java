package com.erp.hr.dailyworker;

import com.erp.hr.dailypayitem.DailyPayItem;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 급여대장 줄의 일근무 · 소득세 · 지방소득세 밖 항목 한 칸(전체계산이 만든다).
 * 원본 2026-10-21: 대장 열 'QA관리-야간' 3 · 60,000(= 내역 20,000 × 근무기록확정 3) · 'QA관리-보험' 5,000(= 급여지급사항 금액).
 */
@Entity
@Table(name = "daily_pay_line_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyPayLineItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "line_id")
    private DailyPayLine line;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private DailyPayItem item;

    @Column(precision = 10, scale = 2)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 15, scale = 0)
    private BigDecimal amount;
}
