package com.erp.domain;

import com.erp.domain.enums.TaxAdjustmentType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 세무조정 항목. 회계와 세법이 다르게 보는 금액을 더하거나(ADD) 뺀다(DEDUCT). */
@Entity
@Table(name = "corporate_tax_adjustments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CorporateTaxAdjustment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "return_id")
    private CorporateTaxReturn taxReturn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TaxAdjustmentType type;

    /** 조정 항목명 (예: 접대비 한도초과액) */
    @Column(nullable = false, length = 200)
    private String name;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(length = 500)
    private String remark;
}
