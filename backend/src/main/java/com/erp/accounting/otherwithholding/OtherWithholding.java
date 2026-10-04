package com.erp.accounting.otherwithholding;

import com.erp.accounting.income.IncomeType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;

/**
 * 기타원천세 전표의 한 줄. 근로소득 외의 지급(사업·기타·이자·배당)에 붙는 원천징수 기록.
 * 원본 기타원천세입력(E030314)은 전표 한 장(지급일자-순번, 2025/07/31-2)에 소득자를 여러 줄 넣는다 —
 * 같은 (payDate, slipSeq) 줄들이 한 장이고 머리(귀속연월 · 지급연월 · 소득구분)는 줄마다 같은 값을 든다.
 * 세액은 등록 시점에 계산해 박아 둔다 — 세율이 바뀌어도 과거 지급은 그대로여야 한다.
 */
@Entity
@Table(name = "other_withholdings")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OtherWithholding extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 지급번호 (WT-yyyyMMdd-NNNN) */
    @Column(name = "doc_no", nullable = false, unique = true, length = 30)
    private String docNo;

    @Column(name = "pay_date", nullable = false)
    private LocalDate payDate;

    /** 전표번호의 순번 — 2025/07/31-2 의 2. 같은 지급일자 안에서 1 부터. */
    @Column(name = "slip_seq", nullable = false)
    private Integer slipSeq;

    /** 전표 안 줄 번호(1 부터). */
    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    /** 원본 [지급연월] YYYY-MM — 지급일자와 따로 든다(2025/02/13 지급 · 2025/01 지급연월). */
    @Column(name = "pay_month", nullable = false, length = 7)
    private String payMonth;

    /** 원본 [귀속연월] YYYY-MM. 비우고 등록하면 지급일의 연월. 소득자료제출집계표 · 원천세신고자료비교표가 이것으로 센다. */
    @Column(name = "attribution_month", nullable = false, length = 7)
    private String attributionMonth;

    @Enumerated(EnumType.STRING)
    @Column(name = "income_type", nullable = false, length = 20)
    private IncomeType incomeType;

    /** 거래처로 지급하는 경우. 개인이면 null 이고 payeeName 만 남는다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 소득자등록의 소득자. 원본에는 소득자가 빈 줄도 있다 — 현황에만 보이고 조회 · 집계에서는 빠진다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "payee_id")
    private com.erp.accounting.withholdingpayee.WithholdingPayee payee;

    /** 지급 당시 소득자 이름(상호가 있으면 상호). 소득자가 없는 줄은 null. */
    @Column(name = "payee_name", length = 100)
    private String payeeName;

    /** 사업자등록번호 또는 주민등록번호 */
    @Column(name = "payee_reg_no", length = 20)
    private String payeeRegNo;

    /** 원본 [업종구분코드](사업소득 940903 · 940909 …) / [소득코드](기타소득 60 · 62 · 76 · 79, 이자배당 22). 지급조서 매수를 가른다. */
    @Column(name = "income_code", length = 10)
    private String incomeCode;

    /** 업종명 — 지급 당시 이름 그대로(원본 940909 를 '기타자영업' 으로 남긴 줄이 있다). 사업소득만. */
    @Column(name = "industry_name", length = 50)
    private String industryName;

    /** 필요경비율(%) — 기타소득 · 비거주자만. 원본 선택지 0 · 60 · 70 · 80 · 90. */
    @Column(name = "expense_rate", precision = 5, scale = 2)
    private BigDecimal expenseRate;

    // ── 이자배당소득 전용 칸(원본 기타원천세입력 이자배당소득 격자) ──
    /** 계좌(발행)번호 */
    @Column(name = "account_no", length = 50)
    private String accountNo;

    /** 과세구분코드(T 일반과세 · C 법인 원천징수대상 …) */
    @Column(name = "taxation_code", length = 1)
    private String taxationCode;

    /** 조세특례코드(NN 적용받지 않음 …) */
    @Column(name = "special_code", length = 2)
    private String specialCode;

    /** 금융상품코드(구분 글자 + 번호, A3C …) */
    @Column(name = "product_code", length = 3)
    private String productCode;

    @Column(name = "security_code", length = 30)
    private String securityCode;

    @Column(name = "bond_interest_code", length = 2)
    private String bondInterestCode;

    /** 지급대상기간 시작일 · 종료일 */
    @Column(name = "period_from")
    private LocalDate periodFrom;

    @Column(name = "period_to")
    private LocalDate periodTo;

    /** 이자율 등(%) */
    @Column(name = "interest_rate", precision = 9, scale = 4)
    private BigDecimal interestRate;

    @Enumerated(EnumType.STRING)
    @Column(name = "change_kind", length = 10)
    private ChangeKind changeKind;

    /** 변동자료제출연월 YYYY-MM */
    @Column(name = "change_month", length = 7)
    private String changeMonth;

    @Column(name = "trust_income", nullable = false)
    private boolean trustIncome;

    /** 세액을 0 으로 둔 까닭(소액부징수 · 과세최저한). 없으면 null. */
    @Enumerated(EnumType.STRING)
    @Column(name = "tax_exempt", length = 10)
    private TaxExempt taxExempt;

    /** 세율(%) — 사업 3 · 5 · 20, 기타 0 · 15 · 20 · 30, 이자배당은 소득코드마다. */
    @Column(name = "tax_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal taxRate;

    @Column(name = "gross_amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal grossAmount;

    /** 필요경비 (기타소득 60%, 나머지 0) */
    @Column(name = "expense_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal expenseAmount = BigDecimal.ZERO;

    @Column(name = "taxable_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal taxableAmount = BigDecimal.ZERO;

    @Column(name = "income_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal incomeTax = BigDecimal.ZERO;

    @Column(name = "local_income_tax", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal localIncomeTax = BigDecimal.ZERO;

    /** 실지급액 = 지급액 − 소득세 − 지방소득세 */
    @Column(name = "net_amount", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal netAmount = BigDecimal.ZERO;

    @Column(length = 200)
    private String description;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
