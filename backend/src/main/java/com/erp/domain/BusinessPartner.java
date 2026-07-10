package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 거래처 마스터. (이카운트의 '거래처등록' — 매출처/매입처)
 */
@Entity
@Table(name = "business_partners")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BusinessPartner extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 거래처코드 (사업자번호 권장) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 상호(거래처명) */
    @Column(nullable = false, length = 200)
    private String name;

    /** 거래처 구분 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PartnerType type;

    /** 사업자등록번호 */
    @Column(length = 20)
    private String bizRegNo;

    /** 대표자명 */
    @Column(length = 50)
    private String ceoName;

    /** 업태 */
    @Column(length = 100)
    private String bizType;

    /** 종목 */
    @Column(length = 100)
    private String bizItem;

    /** 담당자 */
    @Column(length = 50)
    private String manager;

    /** 연락처 */
    @Column(length = 50)
    private String phone;

    /** 주소 */
    @Column(length = 300)
    private String address;

    /** 영업(매출) 특별단가그룹명 */
    @Column(length = 50)
    private String salesPriceGroup;

    /** 구매(매입) 특별단가그룹명 */
    @Column(length = 50)
    private String purchasePriceGroup;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
