package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 그룹에 속한 항목 하나. amount 를 비우면 항목의 기본금액을 쓴다. */
@Entity
@Table(name = "pay_group_lines",
        uniqueConstraints = @UniqueConstraint(name = "uk_pay_group_lines_group_item",
                columnNames = {"group_id", "pay_item_id"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayGroupLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private PayGroup group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "pay_item_id", nullable = false)
    private PayItem payItem;

    /** 이 그룹에서 쓸 금액. null 이면 항목 기본금액 */
    @Column(precision = 18, scale = 2)
    private BigDecimal amount;

    public BigDecimal resolveAmount() {
        return amount != null ? amount : payItem.getDefaultAmount();
    }
}
