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

    /**
     * 원본 [관계설정]의 <b>대표거래처</b>. 이 거래처가 어느 회사에 딸린 지점·사업장이면
     * 그 회사를 가리킨다. 미지정이면 자기가 곧 대표다.
     *
     * <p>거래처관리대장 II 의 [대표거래처로 합산]이 이것을 쓴다 — 켜면 종속 거래처의
     * 채권채무가 대표 밑으로 모인다('거래처관계기준'), 끄면 코드 단위다('개별거래처기준').
     *
     * <p><b>두 단계까지만</b> 둔다. 대표거래처가 다시 남의 종속이 되면 합산이 어디서
     * 멈추는지가 사람마다 다르게 읽힌다 — 서비스가 그것을 거절한다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private BusinessPartner parent;

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
     * 원본 거래처관리대장 I 머리말의 <b>Email</b>. 실제 값이 찍혀 있다.
     * 전자세금계산서·거래명세서를 보낼 곳이라 전화와 따로 든다.
     */
    @Column(length = 150)
    private String email;

    /** 원본 거래처관리대장 I 머리말의 <b>Fax</b>. */
    @Column(length = 50)
    private String fax;

    /**
     * 원본 거래처관리대장 I 머리말의 <b>여신한도</b> (거래처등록 [여신/단가] 탭).
     * 0 은 '한도 없음' 이 아니라 원본이 실제로 0 을 찍고 있는 값이다.
     */
    @Column(name = "credit_limit", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private java.math.BigDecimal creditLimit = java.math.BigDecimal.ZERO;

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
    /**
     * 의료기기 공급내역 보고의 <b>[공급형태]</b> — 이 거래처가 어떤 곳인지.
     *
     * <p>보고 서식이 요구하는 값이라 <b>거래처에 붙어 있어야</b> 한다. 전표마다 다시 고르는
     * 것이 아니라 그 거래처의 성질이기 때문이다. 안 정할 수도 있다 — 의료기기를 안 다루는
     * 회사에는 없는 개념이고, 있는 회사도 모든 거래처가 대상은 아니다.
     *
     * <p>자바 enum 이 아니라 문자열이다(regNoKind·industryKind 와 같다). enum 으로 두면
     * 값을 하나 늘릴 때마다 본사·테넌트 CHECK 를 같이 고쳐야 하고, 잊으면 기동은 멀쩡한데
     * 그 값을 처음 저장할 때 23514 로 터진다.
     */
    @Column(name = "udi_supply_shape", length = 30)
    private String udiSupplyShape;

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

    /**
     * 원본 <b>[외화거래처]</b>. 사본에서 이 칸의 id 는 <code>ddlSforeignFlag</code> —
     * <b>구분이 아니라 깃발</b>이다(업종별구분 <code>ddlSgubun</code> 은 따로 있다).
     * 이 거래처와의 거래가 외화로 오가나.
     */
    @Column(name = "foreign_currency", nullable = false)
    @Builder.Default
    private boolean foreignCurrency = false;

    /**
     * 원본 <b>[거래유형(영업)]</b>·<b>[거래유형(구매)]</b>. 이 거래처와 팔고 살 때의
     * <b>기본</b> 과세 구분이다 — 전표를 열 때마다 고르지 않게 한다.
     * 면세 사업자와 거래하면서 매번 과세로 끊으면 세금계산서가 통째로 틀린다.
     */
    @Column(name = "sales_tax_type", length = 10)
    private String salesTaxType;

    @Column(name = "purchase_tax_type", length = 10)
    private String purchaseTaxType;

    /**
     * 원본 <b>[여신기간]</b> (일). 여신한도가 <b>얼마나</b>라면 이것은 <b>언제까지</b>다 —
     * 한도만 있고 기간이 없으면 오래 안 갚는 곳을 가려낼 수가 없다.
     */
    @Column(name = "credit_days")
    @Builder.Default
    private Integer creditDays = 0;

    /**
     * 원본 <b>[수금/지급예정일]</b>. 매달 며칠에 주고받기로 한 날 (1~31).
     * 0 이면 안 정한 것이다 — 거래처마다 결제일이 달라 전표 날짜로는 짐작할 수 없다.
     */
    @Column(name = "settle_due_day")
    @Builder.Default
    private Integer settleDueDay = 0;

    /**
     * 원본 <b>[채권번호관리]</b>·<b>[채무번호관리]</b>. 이 거래처의 채권·채무를
     * <b>건별 번호로</b> 따라가나. 켜면 어느 매출이 아직 안 들어왔는지 건마다 맞춰 본다.
     */
    @Column(name = "ar_no_managed", nullable = false)
    @Builder.Default
    private boolean arNoManaged = false;

    @Column(name = "ap_no_managed", nullable = false)
    @Builder.Default
    private boolean apNoManaged = false;


    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
