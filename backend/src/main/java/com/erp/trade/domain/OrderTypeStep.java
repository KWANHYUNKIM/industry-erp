package com.erp.trade.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 오더관리유형의 <b>단계 한 칸</b> — 원본 오더관리유형리스트의 [1단계]~[10단계] 열.
 *
 * <p>유형은 "그 오더가 밟아 갈 단계의 순서" 를 담는 템플릿이다.
 * 원본 '기본형' 은 주문서 → 발주서 → 구매 → 판매 → 출하지시서 → 출하 순이다.
 */
@Entity
@Table(name = "order_type_steps")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderTypeStep extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_type_id", nullable = false)
    private OrderType orderType;

    /** 1부터. 원본의 [n단계]. */
    @Column(nullable = false)
    private Integer seq;

    /*
     * 원본 오더관리유형리스트(E040901) 격자의 <b>[담당자]</b> — 단계마다 하나씩이다
     * (2026-09-01 실측: 1단계~10단계 열 아래에 담당자 줄이 따로 있다).
     * 우리는 유형에 하나만 두어 <b>그 담당자가 어느 단계 사람인지</b> 알 수 없었다.
     * 사람 마스터를 물지 않고 이름만 든다 — trade 는 hr 을 참조할 수 없다.
     */
    @Column(length = 50)
    private String charge;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_stage_id", nullable = false)
    private OrderStage stage;
}
