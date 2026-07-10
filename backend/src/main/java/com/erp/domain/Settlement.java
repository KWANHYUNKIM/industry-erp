package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 수금/지급 전표. 수금 → 거래처 채권 감소, 지급 → 거래처 채무 감소.
 */
@Entity
@Table(name = "settlements")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Settlement extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (수금 RC-…, 지급 PY-…) */
    @Column(nullable = false, unique = true, length = 30)
    private String docNo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SettlementType type;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Column(nullable = false)
    private LocalDate settleDate;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    /** 결제수단 (현금/계좌이체/어음 등) */
    @Column(length = 30)
    private String method;

    @Column(length = 500)
    private String note;

    @Column(length = 50)
    private String createdBy;
}
