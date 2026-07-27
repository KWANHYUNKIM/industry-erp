package com.erp.trade.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.trade.domain.enums.MallAccountType;
import jakarta.persistence.*;
import lombok.*;

/**
 * 쇼핑몰 등록(C000664). 우리가 판매하는 쇼핑몰/통합관리솔루션 계정 마스터.
 * 주문 수집·품목코드연결의 '쇼핑몰' 선택지가 되고, 판매전환 시 기본 거래처(partner)를 제공한다.
 * (외부 오픈API 인증·자동수집 연동은 별개 트랙 — 여기서는 레지스트리와 기본 거래처 연결만 소유한다.)
 */
@Entity
@Table(name = "mall_accounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MallAccount extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 쇼핑몰코드 (예: MA001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 쇼핑몰명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 구분: 쇼핑몰 / 통합관리솔루션 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private MallAccountType type = MallAccountType.MALL;

    /** 판매전환 시 기본 거래처(몰을 하나의 거래처로 집계) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 판매자 ID(몰 셀러 계정) */
    @Column(name = "seller_id", length = 100)
    private String sellerId;

    @Column(length = 300)
    private String memo;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
