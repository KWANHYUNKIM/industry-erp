package com.erp.settings.preference;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 환경설정 (단일 레코드). Self-Customizing > 환경설정.
 * ddl-auto:update 환경이므로 nullable=false 컬럼은 반드시 @Builder.Default + DB default 를 지정한다.
 */
@Entity
@Table(name = "preference")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Preference extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 회계연도 시작월 (01~12) */
    @Builder.Default
    @Column(nullable = false, length = 2, columnDefinition = "varchar(2) default '01'")
    private String fiscalStart = "01";

    /** 기준통화 (KRW/USD/EUR/JPY) */
    @Builder.Default
    @Column(nullable = false, length = 10, columnDefinition = "varchar(10) default 'KRW'")
    private String currency = "KRW";

    /** 금액 소수자리 (0~2) */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer default 0")
    private Integer decimals = 0;

    /** 재고 마이너스 허용 */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default false")
    private Boolean negativeStock = false;

    /** 전표번호 자동채번 */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default true")
    private Boolean autoDocNo = true;

    /** 로트/시리얼 관리 사용 */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default true")
    private Boolean lotUse = true;

    /** 판매/구매 결재 필수 */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default false")
    private Boolean approvalRequired = false;

    /** 단가 열람 권한 제한 */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default true")
    private Boolean priceHide = true;

    // ── 기본값설정(C001124) — 2026-10-22 원본 실측 기본값 ──

    /** 0값표시: 표시(true) · 표시안함(false, 원본 기본). 표시안함이면 0 을 공란으로. */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default false")
    private Boolean zeroDisplay = false;

    /** 12/24시간제: false = 12시간제('오전 0:03', 원본 적용예시) · true = 24시간제. */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default false")
    private Boolean clock24 = false;

    /** 인쇄설정 › 인쇄정렬: LEFT · CENTER(원본 기본) · RIGHT. */
    @Builder.Default
    @Column(nullable = false, length = 6, columnDefinition = "varchar(6) default 'CENTER'")
    private String printAlign = "CENTER";

    /** 인쇄설정 › 인쇄방향: PORTRAIT(세로, 원본 기본) · LANDSCAPE(가로). */
    @Builder.Default
    @Column(nullable = false, length = 9, columnDefinition = "varchar(9) default 'PORTRAIT'")
    private String printOrientation = "PORTRAIT";
}
