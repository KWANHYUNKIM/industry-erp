package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 명함. 거래처에 붙는 담당자 연락처 마스터.
 * 아직 거래 전인 잠재 고객의 명함도 있으므로 partner 는 없을 수 있고, 그때는 companyName 을 쓴다.
 */
@Entity
@Table(name = "business_cards")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BusinessCard extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    /** 등록된 거래처의 담당자면 연결한다. 잠재 고객이면 null */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 거래처가 없는 명함의 회사명 */
    @Column(name = "company_name", length = 200)
    private String companyName;

    @Column(length = 100)
    private String department;

    @Column(name = "job_title", length = 100)
    private String jobTitle;

    @Column(length = 30)
    private String phone;

    @Column(length = 30)
    private String mobile;

    @Column(length = 200)
    private String email;

    @Column(length = 300)
    private String address;

    /** 이 명함을 보유한 우리 쪽 직원 (누구의 인맥인지) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private User owner;

    /** 쉼표로 구분한 태그 */
    @Column(length = 200)
    private String tags;

    @Column(length = 1000)
    private String memo;
}
