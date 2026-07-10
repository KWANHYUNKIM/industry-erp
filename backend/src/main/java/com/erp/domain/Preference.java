package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

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
}
