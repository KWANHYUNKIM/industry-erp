package com.erp.trade.ordertype;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 원본 오더관리진행단계(E040904)의 <b>오더관리번호</b> — 전표와 따로 만드는 오더 한 건.
 *
 * <p>2026-10-21 loginaa 실측: [신규(F2)] → [오더관리번호등록] 창에서 번호(00027, 자동) · 오더관리명 ·
 * 오더관리유형 · 생성일자 · 적요1 · 적요2 · 검색창내용을 넣는다. 유형은 등록한 뒤 잠긴다.
 * 격자 [진행단계] 는 유형의 처리단계를 늘어놓고, [전체단계완료] 를 누르면 진행상태가 완료가 된다.
 */
@Entity
@Table(name = "order_numbers")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderNumber extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_no", nullable = false, unique = true, length = 30)
    private String orderNo;

    @Column(nullable = false, length = 100)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_type_id", nullable = false)
    private OrderType orderType;

    /** 원본 [생성일자] — 격자의 [기준일자]. */
    @Column(name = "created_date", nullable = false)
    private LocalDate createdDate;

    @Column(length = 200)
    private String remarks1;

    @Column(length = 200)
    private String remarks2;

    /** 원본 [검색창내용] — 화면에는 안 찍고 찾는 데만 쓴다. */
    @Column(name = "search_keyword", length = 100)
    private String searchKeyword;

    /** 원본 [전체단계완료] 로 종결했나 — 상세 [진행상태] 진행중/완료. */
    @Column(nullable = false)
    @Builder.Default
    private boolean completed = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
