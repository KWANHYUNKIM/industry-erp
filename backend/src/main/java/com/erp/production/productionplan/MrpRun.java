package com.erp.production.productionplan;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 원본 <b>생산계획/MRP리스트</b>의 한 줄 — 생성일자 · 생산계획기간 · 기준품목 · 적요와,
 * 그 기간으로 [생산계획계산]·[MRP계산] 을 언제 돌렸는지. 결과는 {@link MrpRunLine} 에 저장한다.
 */
@Entity
@Table(name = "mrp_runs")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MrpRun extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 원본 [생성일자] 의 "2026/10/02 -1" — 날짜와 그날의 차례. */
    @Column(name = "run_no", nullable = false, length = 30)
    private String runNo;

    @Column(name = "run_date", nullable = false)
    private LocalDate runDate;

    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    /** 원본 [기준품목] — 없으면 전체. 고르면 그 품목과 BOM 아래 품목만 계산한다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "base_item_id")
    private Item baseItem;

    @Column(length = 300)
    private String note;

    /** [생산계획계산 생성] 을 마지막으로 돌린 때. null 이면 아직 안 돌렸다. */
    @Column(name = "plan_generated_at")
    private LocalDateTime planGeneratedAt;

    /** [MRP계산 생성] 을 마지막으로 돌린 때. */
    @Column(name = "mrp_generated_at")
    private LocalDateTime mrpGeneratedAt;

    @Column(length = 50)
    private String createdBy;

    /** 원본 [생산계획대상-전표] — 미판매 · 미구매 · 미생산/미소모. 기본은 앞 둘만 켠다(원본 기본값). */
    @Column(name = "src_unsold", nullable = false)
    @Builder.Default
    private boolean srcUnsold = true;

    @Column(name = "src_unpurchased", nullable = false)
    @Builder.Default
    private boolean srcUnpurchased = true;

    @Column(name = "src_unproduced", nullable = false)
    @Builder.Default
    private boolean srcUnproduced = false;
}
