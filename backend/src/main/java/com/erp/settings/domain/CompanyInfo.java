package com.erp.settings.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 회사 기본정보 (단일 레코드). Self-Customizing > 정보관리.
 */
@Entity
@Table(name = "company_info")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CompanyInfo extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 회사명(상호) */
    @Column(nullable = false, length = 200)
    private String name;

    /** 대표자 */
    @Column(length = 50)
    private String ceo;

    /** 사업자등록번호 */
    @Column(length = 20)
    private String bizRegNo;

    /** 법인등록번호 */
    @Column(length = 20)
    private String corpRegNo;

    /** 업태 */
    @Column(length = 100)
    private String bizType;

    /** 종목 */
    @Column(length = 100)
    private String bizItem;

    @Column(length = 30)
    private String tel;

    @Column(length = 30)
    private String fax;

    @Column(length = 100)
    private String email;

    @Column(length = 10)
    private String zipcode;

    @Column(length = 300)
    private String address;

    @Column(length = 200)
    private String addressDetail;
}
