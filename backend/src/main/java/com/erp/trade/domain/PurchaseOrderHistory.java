package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 발주(단가요청)가 <b>언제 어느 단계로 넘어갔는지</b>. 원본 단가요청진행단계의 [이력].
 *
 * <p>우리는 지금 상태만 들고 있어서 "언제 단가확정으로 넘어갔나", "누가 취소했나" 를
 * 물을 수가 없었다 — 늦어진 발주를 두고 <b>어디서 멈춰 있었는지</b> 아무도 답하지 못했다.
 *
 * <p>고치지 않는다. 한 번 남긴 자취를 나중에 손대면 그것은 이력이 아니다.
 */
@Entity
@Table(name = "purchase_order_histories")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PurchaseOrderHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private PurchaseOrder order;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;

    /** 넘어오기 전 상태. 처음 만들 때는 없다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 20)
    private PurchaseOrderStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 20)
    private PurchaseOrderStatus toStatus;

    @Column(name = "changed_by", length = 50)
    private String changedBy;

    /** 그 단계에서 함께 정해진 것(납기일·유효기간 등). 없으면 null. */
    @Column(length = 300)
    private String note;
}
