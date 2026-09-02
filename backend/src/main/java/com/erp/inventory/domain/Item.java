package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

/**
 * 품목 마스터. (이카운트의 '품목등록'에 대응)
 */
@Entity
@Table(name = "items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Item extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 품목코드 (예: ITM-0001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 품명 */
    @Column(nullable = false, length = 200)
    private String name;

    /** 규격 (예: 100x200mm) */
    @Column(length = 200)
    private String spec;

    /** 단위 (예: EA, KG, BOX) */
    @Column(nullable = false, length = 20)
    private String unit;

    /** 품목분류 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ItemCategory category;

    /** 사용자 정의 품목그룹. 미지정 허용. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_group_id")
    private ItemGroup itemGroup;

    /**
     * 관리항목. 이카운트 품목등록(ESA009M) A7 탭의 <b>관리항목</b>(`item_type`)에 해당한다.
     *
     * <p>전표 라인에 사람이 고르는 값이 아니다 — 원본 판매입력 그리드의 관리항목 열(`item_des`)은
     * <b>disabled</b> 이고, 품목에 설정된 값이 따라 붙기만 한다. 그래서 라인이 아니라 품목에 둔다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "management_item_id")
    private ManagementItem managementItem;

    /** 표준 단가 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    /**
     * 구매(입고) 기준단가. 판매 기준단가(unitPrice)와 <b>따로</b> 둔다.
     *
     * <p>예전에는 단가가 하나뿐이라 구매할인현황이 판매 기준단가와 매입가를 견줬다.
     * 매입가가 판매가보다 높은 것이 이상할 이유가 없어서 개발 자료 488줄이 전부
     * '할증' 으로 찍혔다 — 화면 이름은 할인현황인데 할인이 0건이었다.
     *
     * <p>0 이면 "구매 기준단가를 안 정했다" 는 뜻이다. 그런 품목은 구매할인을 계산하지 않는다.
     */
    @Column(name = "purchase_price", nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal purchasePrice = BigDecimal.ZERO;

    /** 안전재고 (이 수량 미만이면 경고) */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal safetyStock = BigDecimal.ZERO;

    /** 바코드 */
    @Column(length = 100)
    private String barcode;

    /**
     * 원본 품목등록 리스트의 <b>[이미지]</b> 열. 품목 사진 한 장.
     *
     * <p>비슷하게 생긴 부품이 수십 개인데 코드와 이름만으로 고르게 하고 있었다.
     * 파일 자체는 stored_files 가 들고 있다(기안서 첨부·ECDrive 와 같은 저장소) —
     * 여기서는 그중 한 건을 가리킨다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "image_file_id")
    private com.erp.common.StoredFile imageFile;

    /**
     * 원본 품목등록 리스트의 <b>[구매처명]</b> — 이 품목을 늘 사 오는 곳.
     *
     * <p><b>@ManyToOne 이 아닌 이유:</b> inventory 는 trade 를 참조할 수 없다(CLAUDE.md §4.1 —
     * trade → inventory 가 이미 있어 맞물리면 순환이 된다). {@code Warehouse.outsourcingPartnerId},
     * {@code User.employeeId} 와 같은 자리다. 이름은 화면이 거래처 목록에서 붙인다.
     */
    @Column(name = "supplier_id")
    private Long supplierId;

    /**
     * 원본 품목등록 리스트의 <b>[검색창내용]</b>.
     * 공식 품목명 말고 현장에서 부르는 이름(약칭·옛 코드·영문명)을 적어 두고 그걸로 찾는다.
     */
    @Column(name = "search_keyword", length = 200)
    private String searchKeyword;

    /**
     * 의료기기 표준코드(UDI-DI). 값이 있으면 의료기기공급내역보고(E040231) 대상 품목으로 본다.
     * 별도 플래그를 두지 않는 이유: 보고에 필요한 것이 이 코드 자체라, 코드가 없으면 어차피 보고할 수 없다.
     */
    @Column(name = "udi_di", length = 50)
    private String udiDi;

    /** 사용 여부 */
    /**
     * 재고수량관리 — 원본 품목등록 리스트의 열이다(값이 '수량관리대상' · '수량관리제외').
     *
     * <p>용역·운반비 같은 품목은 재고를 잡지 않는다. 우리는 모든 품목의 재고를 잡아서,
     * 그런 품목을 판매전표에 넣으면 "재고가 부족합니다" 로 막히거나 재고가 음수 쪽으로 밀렸다.
     *
     * <p>기본은 <b>관리대상</b>이다. 대부분의 품목이 그렇고, 모르고 껐다가 재고가
     * 조용히 안 움직이는 것보다는 켜 두고 필요할 때 끄는 쪽이 안전하다.
     */
    @Column(name = "stock_tracked", nullable = false)
    @lombok.Builder.Default
    private boolean stockTracked = true;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /** 원본 <b>[적요]</b>. 품목에 남기는 메모. */
    @Column(length = 200)
    private String remark;

    /**
     * 원본 <b>[부가세율(매출)]</b>·<b>[부가세율(매입)]</b> (%).
     *
     * <p>품목마다 세율이 갈리는 회사가 있다(면세 품목·영세율 수출품). 전표에서 매번 고르게
     * 하면 사람이 틀리고, 틀린 것이 세금계산서까지 간다. 기본은 10 이다.
     */
    @Column(name = "vat_rate_sales", precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal vatRateSales = BigDecimal.TEN;

    @Column(name = "vat_rate_purchase", precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal vatRatePurchase = BigDecimal.TEN;

    /** 원본 <b>[외주비단가]</b>. 이 품목을 외주로 돌릴 때 한 개당 주는 값. */
    @Column(name = "subcontract_price", precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal subcontractPrice = BigDecimal.ZERO;

    /**
     * 원본 <b>[조달기간]</b> (일). 주문하고 물건이 오기까지 걸리는 날수 —
     * 발주계획이 <b>언제 넣어야 하나</b>를 이 값으로 거꾸로 센다.
     */
    @Column(name = "lead_time_days")
    @Builder.Default
    private Integer leadTimeDays = 0;

    /** 원본 <b>[최소구매단위]</b>. 이보다 적게는 못 산다(박스 단위로만 파는 것 등). */
    @Column(name = "min_purchase_unit", precision = 15, scale = 3)
    @Builder.Default
    private BigDecimal minPurchaseUnit = BigDecimal.ZERO;

    /** 원본 <b>[세트여부]</b>. 여러 품목을 묶어 하나로 파는 것. */
    @Column(name = "set_item", nullable = false)
    @Builder.Default
    private boolean setItem = false;

    /** 원본 <b>[품목공유여부]</b>. 회사 사이에서 이 품목을 같이 쓰나. */
    @Column(name = "shared_item", nullable = false)
    @Builder.Default
    private boolean sharedItem = false;

    /**
     * 원본 <b>[품목유형]</b>. 사본에 값 목록이 남아 있지 않아 <b>자유 입력</b>으로 둔다 —
     * 고를 값을 지어내면 원본에 없는 낱말을 이름표만 같게 달아 놓는 꼴이 된다.
     */
    @Column(name = "item_type", length = 30)
    private String itemType;

    /**
     * 원본 <b>[대표품목]</b>. 규격만 다른 형제 품목들의 대표. 안 정하면 자기가 곧 대표다
     * (거래처의 대표거래처와 같은 얼개다).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_item_id")
    private Item parentItem;

    /**
     * 원본 <b>[시리얼/로트No.]</b>. 이 품목을 로트로 관리하나.
     * 켜면 입출고할 때 로트번호를 받는다.
     */
    @Column(name = "lot_managed", nullable = false)
    @Builder.Default
    private boolean lotManaged = false;

    /**
     * 원본 <b>[품질검사유형]</b>·<b>[품질검사방법]</b>. 값은 품질 모듈이 쓰는 것과 같다 —
     * 유형은 수입검사·공정검사·출하검사, 방법은 전수·샘플링(사본 실측).
     *
     * <p><b>enum 을 그대로 쓰지 않고 문자열로 둔다.</b> 재고(inventory)는 아무 모듈에도
     * 의존하지 않는 기반층이라 quality 를 참조하는 순간 순환이 생긴다(CLAUDE.md 4.1).
     */
    @Column(name = "qc_type", length = 20)
    private String qcType;

    @Column(name = "qc_method", length = 10)
    private String qcMethod;

    /** 원본 <b>[품질검사요청-구매]</b>·<b>[품질검사요청-생산입고]</b>. 그때 검사요청을 자동으로 낸다. */
    @Column(name = "qc_on_purchase", nullable = false)
    @Builder.Default
    private boolean qcOnPurchase = false;

    @Column(name = "qc_on_production", nullable = false)
    @Builder.Default
    private boolean qcOnProduction = false;

    /**
     * 원본 <b>[생산전표생성-판매]</b>·<b>[생산전표생성-창고이동]</b>.
     * 팔거나 옮길 때 생산전표를 자동으로 만든다 — 만들면서 파는 품목에 쓴다.
     */
    @Column(name = "auto_production_on_sales", nullable = false)
    @Builder.Default
    private boolean autoProductionOnSales = false;

    @Column(name = "auto_production_on_transfer", nullable = false)
    @Builder.Default
    private boolean autoProductionOnTransfer = false;
}
