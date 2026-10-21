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

    /** 상위계정 — 계정 나무. null 이면 맨 위. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Account parent;

    /** 묶음 계정(굵은 줄) — 전표에 쓰지 못한다. false 면 전표입력계정. */
    @Column(name = "group_account", nullable = false)
    @Builder.Default
    private boolean groupAccount = false;

    /** 대차구분 */
    @Enumerated(EnumType.STRING)
    @Column(name = "debit_credit", nullable = false, length = 10)
    private AccountDebitCredit debitCredit;

    /** 평가구분 */
    @Enumerated(EnumType.STRING)
    @Column(name = "eval_kind", nullable = false, length = 20)
    @Builder.Default
    private AccountEvalKind evalKind = AccountEvalKind.NONE;

    /** 수입지출구분 */
    @Enumerated(EnumType.STRING)
    @Column(name = "cash_flow_kind", nullable = false, length = 20)
    @Builder.Default
    private AccountCashFlowKind cashFlowKind = AccountCashFlowKind.NONE;

    /** 검색창내용 */
    @Column(name = "search_keyword", length = 100)
    private String searchKeyword;

    @Column(name = "remark1", length = 100)
    private String remark1;

    @Column(name = "remark2", length = 100)
    private String remark2;

    /** 대차구분을 안 정하고 만든 계정(표준계정 시드 등)은 구분·이름으로 정한다 — 자산·비용은 차변, 차감 계정(충당금·누계액)은 대변. */
    @PrePersist
    void fillDefaults() {
        if (debitCredit == null) {
            boolean contra = division == AccountDivision.ASSET && (name.contains("충당금") || name.contains("누계액"));
            boolean debit = (division == AccountDivision.ASSET || division == AccountDivision.EXPENSE) && !contra;
            debitCredit = debit ? AccountDebitCredit.DEBIT : AccountDebitCredit.CREDIT;
        }
        if (evalKind == AccountEvalKind.NONE) {
            if (name.contains("대손충당금")) evalKind = AccountEvalKind.EVAL;
            else if (name.equals("외상매출금")) evalKind = AccountEvalKind.TARGET;
        }
    }
}
