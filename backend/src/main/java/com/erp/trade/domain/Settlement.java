package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

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

    /**
     * 귀속 프로젝트. 판매·구매·비용은 진작 다는데 여기만 없었다.
     *
     * <p>프로젝트별 손익을 집계하려면 <b>돈이 들어오고 나가는 전표</b>가 프로젝트를 알아야 한다.
     * 안 정할 수도 있다 — 프로젝트를 안 쓰는 회사도 있고, 프로젝트에 안 묶이는 거래도 있다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private com.erp.inventory.domain.Project project;

    /**
     * 회계반영 여부. 원본 결제내역조회의 [미반영 · 회계반영] 탭.
     *
     * <p>반영하면 수금은 차)현금 / 대)외상매출금, 지급은 차)외상매입금 / 대)현금 분개가
     * 생긴다. 안 하면 판매로 잡힌 외상매출금이 한 방향으로만 쌓인다.
     */
    @Column(name = "accounting_reflected", nullable = false)
    @Builder.Default
    private boolean accountingReflected = false;

    @Column(length = 50)
    private String createdBy;
}
