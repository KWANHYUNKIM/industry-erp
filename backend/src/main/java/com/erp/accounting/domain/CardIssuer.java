package com.erp.accounting.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 카드사 마스터(E010109). 카드등록(CreditCard)의 카드사(cardCompany) 선택지가 되는 기초등록 마스터.
 * (신한카드·삼성카드 등 발급사. 수수료율은 매출 카드결제 정산 참고용.)
 */
@Entity
@Table(name = "card_issuers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CardIssuer extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 카드사코드 (예: CI001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 카드사명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 수수료율(%) */
    @Column(name = "fee_rate", precision = 6, scale = 3)
    @Builder.Default
    private BigDecimal feeRate = BigDecimal.ZERO;

    @Column(length = 200)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
