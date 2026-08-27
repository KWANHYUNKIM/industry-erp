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
}
