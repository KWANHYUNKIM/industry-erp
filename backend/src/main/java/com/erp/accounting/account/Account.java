package com.erp.accounting.account;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 계정과목 마스터. (회계 기초등록 > 계정과목등록)
 */
@Entity
@Table(name = "accounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Account extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 계정코드 (예: 811) */
    @Column(nullable = false, unique = true, length = 20)
    private String code;

    /** 계정과목명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 계정 구분 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AccountDivision division;

    /** 세부분류 (예: 판매관리비) */
    @Column(length = 50)
    private String detailCategory;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /** 지출증빙현황 [계정설정]의 인쇄방법 — true 면 '표시'. 원본은 모든 계정이 '표시안함' 으로 시작한다. */
    @Column(name = "evidence_report", nullable = false)
    @Builder.Default
    private boolean evidenceReport = false;

    /** [관련업무] — 채권/채무 면 거래처관리대장 I · II 에 잡힌다(원본 1089 외상매출금 · 2519 외상매입금). */
    @Enumerated(EnumType.STRING)
    @Column(name = "related_work", nullable = false, length = 30)
    @Builder.Default
    private AccountRelatedWork relatedWork = AccountRelatedWork.NONE;

    /** [거래처별집계구분] — true 면 '거래처별'(원본 미수금 · 외상매출금), false 면 '없음'. */
    @Column(name = "partner_aggregate", nullable = false)
    @Builder.Default
    private boolean partnerAggregate = false;
}
