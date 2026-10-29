package com.erp.settings.companyinfo;

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

    /**
     * 회사 로고(마크) — 머리 로고 자리 · 브라우저 탭 아이콘에 상호 글자 대신 나온다. 작은 그림만(CompanyInfoService.LOGO_MAX).
     * Postgres bytea(@Lob 은 oid 로 매핑돼 쓰지 않는다 — StoredFileData 와 같다).
     */
    @Column(name = "logo", columnDefinition = "bytea")
    private byte[] logo;

    /** 로고 그림 형식(image/png …). */
    @Column(name = "logo_type", length = 50)
    private String logoType;

    /** 로고를 바꿀 때마다 새 값 — 화면이 같은 그림을 다시 받을지 고른다. */
    @Column(name = "logo_version")
    private Long logoVersion;
}
