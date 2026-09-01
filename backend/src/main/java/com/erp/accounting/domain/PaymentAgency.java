package com.erp.accounting.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;

/**
 * 결제대행사(PG) 마스터(E010114). 온라인 결제대행사(대표자·연락처 포함) 기초등록.
 */
@Entity
@Table(name = "payment_agencies")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PaymentAgency extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 결제대행사코드 (예: PA001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 결제대행사명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 대표자명 */
    @Column(name = "ceo_name", length = 50)
    private String ceoName;

    @Column(length = 30)
    private String phone;

    @Column(length = 100)
    private String email;

    @Column(length = 200)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /**
     * 원본 <b>[계정]</b> — 이 곳에서 나가는 수수료를 다는 계정. 회계반영이 이 값을 본다.
     * 안 정할 수 있다(정하지 않으면 반영할 때 사람이 고른다).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private Account account;

    /** 원본 <b>[입금계좌]</b> — 정산 금액이 들어오는 우리 계좌. */
    @Column(name = "deposit_account", length = 100)
    private String depositAccount;

    /** 원본 <b>[검색창내용]</b>. 부르는 이름으로 찾는다(거래처와 같다). */
    @Column(name = "search_keyword", length = 100)
    private String searchKeyword;

    /** 원본 <b>[수수료율]</b> (%). 카드사와 같은 자리다. */
    @Column(name = "fee_rate", precision = 6, scale = 3)
    @Builder.Default
    private BigDecimal feeRate = BigDecimal.ZERO;

    /** 원본 <b>[결제대행사코드구분]</b> — 사업자등록번호 · 주민등록번호 · 외국인. 거래처와 같은 값이다. */
    @Column(name = "reg_no_kind", nullable = false, length = 20)
    @Builder.Default
    private String regNoKind = "사업자등록번호";

    /** 원본 <b>[업종별구분]</b> — 일반 · 관세사 · <b>외화거래처</b>. 조건 [외화거래처]가 이 값을 본다. */
    @Column(name = "industry_kind", nullable = false, length = 20)
    @Builder.Default
    private String industryKind = "일반";

    /** 원본 <b>[업태]</b>·<b>[종목]</b>. 세금계산서에 찍힌다. */
    @Column(name = "biz_type", length = 100)
    private String bizType;

    @Column(name = "biz_item", length = 100)
    private String bizItem;

    /** 원본 <b>[담당자]</b> — 그 대행사 쪽 사람이다(우리 사원이 아니다). */
    @Column(length = 50)
    private String manager;

    /** 원본 <b>[세무신고거래처]</b>. 끄면 신고 자료에서 뺀다. */
    @Column(name = "tax_report", nullable = false)
    @Builder.Default
    private boolean taxReport = true;

    /** 원본 <b>[우편번호1]</b>·<b>[주소1]</b>. */
    @Column(name = "postal_code", length = 20)
    private String postalCode;

    @Column(length = 300)
    private String address;

    /** 원본 <b>[우편번호2]</b>·<b>[주소2]</b>. 주소1과 따로 둔다. */
    @Column(name = "postal_code2", length = 20)
    private String postalCode2;

    @Column(length = 300)
    private String address2;
}
