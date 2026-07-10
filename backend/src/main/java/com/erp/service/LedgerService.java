package com.erp.service;

import com.erp.domain.BusinessPartner;
import com.erp.domain.SettlementType;
import com.erp.dto.LedgerDtos.PartnerBalanceResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.PurchaseRepository;
import com.erp.repository.SalesRepository;
import com.erp.repository.SettlementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class LedgerService {

    private final BusinessPartnerRepository partnerRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SettlementRepository settlementRepository;

    /** 거래처별 채권(매출−수금)·채무(매입−지급) 현황 */
    @Transactional(readOnly = true)
    public List<PartnerBalanceResponse> partnerBalances() {
        Map<Long, BigDecimal> receivables = salesRepository.sumTotalByPartner().stream()
                .collect(Collectors.toMap(SalesRepository.PartnerAmount::getPartnerId,
                        SalesRepository.PartnerAmount::getTotal));
        Map<Long, BigDecimal> payables = new HashMap<>();
        purchaseRepository.sumTotalByPartner()
                .forEach(pa -> payables.put(pa.getPartnerId(), pa.getTotal()));

        // 수금 차감 → 순 미수금, 지급 차감 → 순 미지급
        settlementRepository.sumByPartner(SettlementType.RECEIPT).forEach(pa ->
                receivables.merge(pa.getPartnerId(), pa.getTotal().negate(), BigDecimal::add));
        settlementRepository.sumByPartner(SettlementType.PAYMENT).forEach(pa ->
                payables.merge(pa.getPartnerId(), pa.getTotal().negate(), BigDecimal::add));

        return partnerRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(p -> toBalance(p, receivables, payables))
                .toList();
    }

    private PartnerBalanceResponse toBalance(BusinessPartner p,
                                             Map<Long, BigDecimal> receivables,
                                             Map<Long, BigDecimal> payables) {
        return new PartnerBalanceResponse(
                p.getId(), p.getCode(), p.getName(), p.getType(), p.getType().getDisplayName(),
                receivables.getOrDefault(p.getId(), BigDecimal.ZERO),
                payables.getOrDefault(p.getId(), BigDecimal.ZERO));
    }
}
