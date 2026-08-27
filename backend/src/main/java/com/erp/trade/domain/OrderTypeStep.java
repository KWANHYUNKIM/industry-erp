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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_stage_id", nullable = false)
    private OrderStage stage;
}
