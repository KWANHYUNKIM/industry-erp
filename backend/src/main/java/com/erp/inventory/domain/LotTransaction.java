package com.erp.inventory.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.enums.LotTxType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 로트 입출고 이력 한 건. 로트 생성(입고)·소모(출고)·조정 시 기록되어 로트 수불부/내역조회의 근거가 된다.
 * balanceAfter 는 해당 로트의 그 시점 재고(running balance)다.
 */
@Entity
@Table(name = "lot_transactions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class LotTransaction extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lot_id", nullable = false)
    private Lot lot;

    @Column(name = "tx_date", nullable = false)
    private LocalDate txDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LotTxType type;

    @Column(name = "quantity_change", nullable = false, precision = 18, scale = 2)
    private BigDecimal quantityChange;

    @Column(name = "balance_after", nullable = false, precision = 18, scale = 2)
    private BigDecimal balanceAfter;

    @Column(length = 300)
    private String note;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
