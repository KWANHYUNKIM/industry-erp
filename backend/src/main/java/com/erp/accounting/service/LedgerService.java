package com.erp.accounting.service;

import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.SettlementType;
import com.erp.accounting.dto.LedgerDtos.PartnerBalanceResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.SalesRepository;
import com.erp.trade.repository.SettlementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.erp.accounting.dto.LedgerDtos;

@Service
@RequiredArgsConstructor
public class LedgerService {

    private final BusinessPartnerRepository partnerRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SettlementRepository settlementRepository;

    /** 거래처별 채권(매출−수금)·채무(매입−지급) 현황 — 현재 시점 잔액. */
    @Transactional(readOnly = true)
    public List<PartnerBalanceResponse> partnerBalances() {
        return partnerBalances(null);
    }

    /**
     * 거래처별 채권·채무 현황.
     *
     * {@code asOf} 를 주면 그 날짜까지의 전표·정산만 더한 <b>기준일자 잔액</b>이다
     * (채권/채무현황 E040703·채권현황 E040721 의 '기준일자'). null 이면 전체 기간.
     */
    @Transactional(readOnly = true)
    public List<PartnerBalanceResponse> partnerBalances(java.time.LocalDate asOf) {
        List<SalesRepository.PartnerAmount> salesSums = asOf == null
                ? salesRepository.sumTotalByPartner() : salesRepository.sumTotalByPartnerUntil(asOf);
        Map<Long, BigDecimal> receivables = salesSums.stream()
                .collect(Collectors.toMap(SalesRepository.PartnerAmount::getPartnerId,
                        SalesRepository.PartnerAmount::getTotal));
        Map<Long, BigDecimal> payables = new HashMap<>();
        (asOf == null ? purchaseRepository.sumTotalByPartner() : purchaseRepository.sumTotalByPartnerUntil(asOf))
                .forEach(pa -> payables.put(pa.getPartnerId(), pa.getTotal()));

        // 수금 차감 → 순 미수금, 지급 차감 → 순 미지급
        (asOf == null ? settlementRepository.sumByPartner(SettlementType.RECEIPT)
                : settlementRepository.sumByPartnerUntil(SettlementType.RECEIPT, asOf)).forEach(pa ->
                receivables.merge(pa.getPartnerId(), pa.getTotal().negate(), BigDecimal::add));
        (asOf == null ? settlementRepository.sumByPartner(SettlementType.PAYMENT)
                : settlementRepository.sumByPartnerUntil(SettlementType.PAYMENT, asOf)).forEach(pa ->
                payables.merge(pa.getPartnerId(), pa.getTotal().negate(), BigDecimal::add));

        return partnerRepository.findAllWithGroup().stream()
                .map(p -> toBalance(p, receivables, payables))
                .toList();
    }

    private PartnerBalanceResponse toBalance(BusinessPartner p,
                                             Map<Long, BigDecimal> receivables,
                                             Map<Long, BigDecimal> payables) {
        return new PartnerBalanceResponse(
                p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                receivables.getOrDefault(p.getId(), BigDecimal.ZERO),
                payables.getOrDefault(p.getId(), BigDecimal.ZERO),
                p.getPartnerGroup() != null ? p.getPartnerGroup().getId() : null,
                p.getPartnerGroup() != null ? p.getPartnerGroup().getName() : null,
                p.getManager(), p.isActive());
    }
}
