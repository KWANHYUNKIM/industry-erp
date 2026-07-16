package com.erp.accounting.domain;

import com.erp.accounting.domain.enums.CardType;
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
}
