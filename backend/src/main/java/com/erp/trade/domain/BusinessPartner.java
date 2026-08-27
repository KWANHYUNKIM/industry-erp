package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

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

    /** 사용자 정의 거래처그룹. 미지정 허용. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_group_id")
    private PartnerGroup partnerGroup;

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

    /**
     * 모바일 — 원본 거래처리스트의 열이다. 전화와 따로다.
     * 대표번호로는 안 되는 일이 있어 담당자 휴대폰을 적어 둔다.
     */
    @Column(length = 50)
    private String mobile;

    /**
     * 이체정보 — 원본 거래처리스트의 [이체정보] 열(값이 '등록'/빈칸).
     * 지급할 때 쓸 계좌다. 없으면 지급할 때마다 딴 데서 찾아야 한다.
     */
    @Column(name = "bank_name", length = 100)
    private String bankName;

    @Column(name = "account_no", length = 50)
    private String accountNo;

    @Column(name = "account_holder", length = 100)
    private String accountHolder;

    /** 주소 */
    /**
     * 우편번호 — 원본 거래처등록 [기본] 탭의 [주소1 우편번호].
     * 주소 안에 섞어 적으면 거래명세서·출하지시서에 따로 뽑을 수가 없다.
     */
    @Column(name = "postal_code", length = 20)
    private String postalCode;

    @Column(length = 300)
    private String address;

    /** 영업(매출) 특별단가그룹명 */
    @Column(length = 50)
    private String salesPriceGroup;

    /** 구매(매입) 특별단가그룹명 */
    @Column(length = 50)
    private String purchasePriceGroup;

    /**
     * 원본 [거래처코드구분] — 사업자등록번호 · 주민등록번호 · 외국인.
     * 등록번호가 무엇인지 정한다. 자릿수 검증이 여기서 갈린다.
     */
    @Column(name = "reg_no_kind", nullable = false, length = 20)
    @Builder.Default
    private String regNoKind = "사업자등록번호";

    /** 원본 [업종별구분] — 일반 · 관세사 · 외화거래처. */
    @Column(name = "industry_kind", nullable = false, length = 20)
    @Builder.Default
    private String industryKind = "일반";

    /** 원본 [종사업장번호]. 사업장이 여럿인 거래처. 세금계산서에 찍힌다. */
    @Column(name = "sub_biz_no", length = 20)
    private String subBizNo;

    /** 원본 [주소2] 와 그 우편번호. 주소1과 따로 둔다(배송지 등). */
    @Column(name = "postal_code2", length = 20)
    private String postalCode2;

    @Column(length = 300)
    private String address2;

    @Column(length = 200)
    private String homepage;

    @Column(length = 500)
    private String remark;

    /** 원본 [세무신고거래처]. 부가세 신고 대상으로 잡을지. */
    @Column(name = "tax_report", nullable = false)
    @Builder.Default
    private boolean taxReport = true;

    /** 원본 [출하대상거래처]. 출하 대상으로 뜰지. */
    @Column(name = "shipment_target", nullable = false)
    @Builder.Default
    private boolean shipmentTarget = true;

    /**
     * 원본 거래처검색·거래처리스트의 <b>[검색창내용]</b>.
     * 공식 이름 말고 사람들이 실제로 부르는 이름(약칭·영문명·옛 상호)을 적어 두고 그걸로 찾는다.
     */
    @Column(name = "search_keyword", length = 200)
    private String searchKeyword;


    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
