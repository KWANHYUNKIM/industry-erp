package com.erp.hr.dailyworker;

import com.erp.hr.dailypayitem.DailyPayItem;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 근무기록확정 창의 일근무 밖 변동(일) 수당 열 한 칸(원본 2026-10-21: 열 'QA관리-야간' — 그 수당의 근무입력 근무기록 합). */
@Entity
@Table(name = "daily_work_confirm_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class DailyWorkConfirmItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "confirm_id")
    private DailyWorkConfirm confirm;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private DailyPayItem item;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal days;

    /** 근무기록확정(금액) — 변동(직접입력) 수당의 근무입력 금액 합(원본 2026-10-21 '… 금액' 열). */
    @Column(precision = 15, scale = 0)
    private BigDecimal amount;
}
