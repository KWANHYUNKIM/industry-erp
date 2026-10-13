package com.erp.inventory.lot;

import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 로트/시리얼 추적 단위. 품목의 입고 로트를 등록하고 현재고·보류를 추적한다.
 */
@Entity
@Table(name = "lots")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Lot extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 로트/시리얼 번호 */
    @Column(nullable = false, unique = true, length = 50)
    private String lotNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    @Column(nullable = false)
    private LocalDate inboundDate;

    /** 유효기한(선택) */
    private LocalDate expireDate;

    /** 입고수량 */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal inboundQty;

    /** 현재고(소진되면 0) */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal stockQty;

    /** 보류 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean held = false;

    /*
     * 원본 시리얼/로트No.등록(E040617)의 [사용구분] — 마스터 플래그(사용 · 사용중단). 목록 기본은 '사용' 이고
     * 사용중단해도 재고현황에는 그대로 남는다(그 화면 '사용중단시리얼/로트포함' 기본 켬, 2026-10-13 실측).
     */
    @Column(name = "use_yn", nullable = false)
    @Builder.Default
    private boolean useYn = true;

    /** 원본 생성 창 기본 탭의 [udi코드](의료기기 표준코드). */
    @Column(name = "udi_code", length = 100)
    private String udiCode;
}
