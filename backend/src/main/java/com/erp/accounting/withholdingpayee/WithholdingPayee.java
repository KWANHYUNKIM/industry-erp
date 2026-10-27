package com.erp.accounting.withholdingpayee;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 기타원천세 소득자(원본 세무 › 기타원천세 › 소득자등록 E030301). 기타원천세 지급 줄이 이 소득자를 고른다.
 * [업종구분코드]는 사업소득 줄의 기본값이고 줄마다 바꿀 수 있다(원본 유강사 학원강사 · 9월 줄 기타인적용역자).
 */
@Entity
@Table(name = "withholding_payees")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WithholdingPayee extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 20)
    private PayeeKind kind;

    @Column(name = "biz_reg_no", length = 20)
    private String bizRegNo;

    /** 주민(법인)등록번호 — 필수. 목록에는 앞자리(6자리)만 보인다. */
    @Column(name = "reg_no", nullable = false, length = 20)
    private String regNo;

    @Column(name = "trade_name", length = 100)
    private String tradeName;

    /** 성명(대표자명) — 필수. */
    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "address", length = 200)
    private String address;

    @Column(name = "english_name", length = 100)
    private String englishName;

    @Column(name = "biz_address", length = 200)
    private String bizAddress;

    /** 소득자구분코드(실지명의구분) — 111 주민등록번호 · 211 사업자등록번호 … */
    @Column(name = "payee_kind_code", length = 3)
    private String payeeKindCode;

    /** 업종구분코드 — 940903 학원강사 … 사업소득 줄의 기본값. */
    @Column(name = "industry_code", length = 6)
    private String industryCode;

    @Column(name = "bank_name", length = 50)
    private String bankName;

    @Column(name = "account_no", length = 50)
    private String accountNo;

    @Column(name = "non_resident", nullable = false)
    private boolean nonResident;

    @Column(name = "foreigner", nullable = false)
    private boolean foreigner;

    /** 비실명(이자/배당소득용) */
    @Column(name = "non_real_name", nullable = false)
    private boolean nonRealName;

    /** 생년월일 YYYYMMDD */
    @Column(name = "birth_date", length = 8)
    private String birthDate;

    @Column(name = "account_code", length = 20)
    private String accountCode;

    @Column(name = "mobile", length = 30)
    private String mobile;

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "memo", length = 500)
    private String memo;

    /** 원본 [삭제/삭제취소] — 지우지 않고 표시만 한다. */
    @Column(name = "deleted", nullable = false)
    private boolean deleted;
}
