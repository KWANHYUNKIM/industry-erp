package com.erp.trade.settlement;

import com.erp.trade.partner.BusinessPartner;
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

    /**
     * 수수료 — 받을 돈 중 거래처(카드사 · 은행)가 떼고 보낸 몫. {@link #amount} 는 <b>채권이 줄어드는 총액</b>이다.
     *
     * <p>2026-10-06 loginaa '매출처로부터' 실측: 금액 1,000 · 수수료 100 으로 저장하자 수금현황 금액은 <b>1,100</b>,
     * 분개는 차)현금 1,000 · 지급수수료(판) 100 / 대)외상매출금 1,100. 그래서 채권 · 수금현황은 amount 그대로 두고
     * 분개만 현금 = amount − fee, 수수료 = fee 로 가른다.
     *
     * <p>지급은 다르다 — 같은 날 '매입처로' 실측(금액 1,000 · 수수료 100): 지급현황 금액 <b>1,000</b>, 분개
     * 차)외상매입금 1,000 · 지급수수료(판) 100 / 대)현금 1,100. 채무는 amount 만큼 줄고 현금이 수수료만큼 더 나간다.
     */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal fee = BigDecimal.ZERO;

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
    private com.erp.inventory.project.Project project;

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
