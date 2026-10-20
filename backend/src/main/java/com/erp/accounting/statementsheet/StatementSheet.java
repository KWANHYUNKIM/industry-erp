package com.erp.accounting.statementsheet;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 회계기수(기간) 한 장 — 원본 현금흐름표 · 이익잉여금처분계산서(2026-10-20 loginaa 실측)는 [신규(F2)] 로 회계기수 · 기간
 * (이익잉여금은 처분확정일, 현금흐름은 대상항목 전체 · 선택)을 저장하고, 항목 금액은 [입력] 창에서 손으로 넣는다.
 * 원본 [계산식 적용] 은 계산식을 두지 않은 판에서 아무것도 채우지 않았다. 항목 금액은 화면이 정한 차례대로 linesJson 에 둔다.
 */
@Entity
@Table(name = "statement_sheets")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class StatementSheet extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StatementSheetKind kind;

    @Column(name = "term_no", nullable = false)
    private Integer termNo;

    @Column(name = "from_ym", nullable = false, length = 7)
    private String fromYm;

    @Column(name = "to_ym", nullable = false, length = 7)
    private String toYm;

    @Column(name = "settle_date")
    private LocalDate settleDate;

    @Column(name = "all_items", nullable = false)
    @Builder.Default
    private boolean allItems = true;

    @Column(name = "lines_json", nullable = false, columnDefinition = "text")
    @Builder.Default
    private String linesJson = "[]";
}
