package com.erp.accounting.bankcard;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 카드등록 (회계 I > 기초등록 > 계좌/카드).
 * 결제계좌(settlementAccount)는 카드대금이 빠져나가는 계좌다.
 */
@Entity
@Table(name = "credit_cards")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CreditCard extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String cardName;

    /** 원본 카드등록의 [카드코드]. 계좌와 같은 까닭으로 nullable 이다. */
    @Column(length = 20)
    private String code;

    /** 카드사 (예: 신한카드) */
    @Column(nullable = false, length = 50)
    private String cardCompany;

    /** 카드번호. 마스킹된 문자열을 그대로 저장한다(예: 5310-****-****-1234). */
    @Column(nullable = false, unique = true, length = 30)
    private String cardNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CardType type;

    /** 명의자(법인카드는 사용 부서·담당자) */
    @Column(length = 50)
    private String ownerName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "settlement_account_id")
    private BankAccount settlementAccount;

    /** 결제일 (매월 n일) */
    private Integer settlementDay;

    @Column(nullable = false)
    private boolean active;

    @Column(length = 200)
    private String remark;

    /** 원본 [카드구분] 신용카드 · 체크카드. */
    @Enumerated(EnumType.STRING)
    @Column(name = "card_kind", nullable = false, length = 10)
    @Builder.Default
    private CardKind cardKind = CardKind.CREDIT;

    /** 원본 [사업용 카드 구분] Y/N(기본 N). */
    @Column(name = "business_use", nullable = false)
    private boolean businessUse;

    /** 원본 [계정] — 이 카드를 쓰면 대변에 잡히는 계정(기본 미지급금). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "gl_account_id")
    private com.erp.accounting.account.Account glAccount;

    /** 원본 [카드관리자]. */
    @Column(length = 50)
    private String manager;

    /** 원본 [검색창내용]. */
    @Column(name = "search_text", length = 100)
    private String searchText;

    /** 거래처 코드도움에 이 카드를 거래처로 내놓는 짝 거래처(PartnerService.syncLinked — BusinessPartner.linkedKind). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private com.erp.trade.partner.BusinessPartner partner;
}
