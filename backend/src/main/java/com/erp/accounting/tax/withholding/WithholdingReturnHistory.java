package com.erp.accounting.tax.withholding;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 원천징수이행상황신고서 한 장을 <b>언제 누가 만들고 고쳤는지</b> — 원본 목록의 [이력] 창
 * (순번 · 작업자ID · 작업일시 · 신고서종류 · 상태, 2026-10-13 loginaa 실측).
 * 원본은 [신규] · 귀속연월 눌러 고치기 창을 '원천징수이행상황신고서 정보' 로, 서식 [저장] 을 '원천징수이행상황신고서' 로 적는다.
 * 우리 서식은 저장 칸이 없어 앞의 것만 남는다. 한 번 남긴 줄은 고치지 않는다.
 */
@Entity
@Table(name = "withholding_return_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WithholdingReturnHistory {

    public static final String KIND_INFO = "원천징수이행상황신고서 정보";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "return_id", nullable = false)
    private WithholdingReturn withholdingReturn;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    @Column(name = "changed_by", length = 50)
    private String changedBy;

    /** 신고서종류 — '원천징수이행상황신고서 정보' */
    @Column(nullable = false, length = 50)
    private String kind;

    /** 상태 — 신규 · 수정 */
    @Column(nullable = false, length = 10)
    private String action;
}
