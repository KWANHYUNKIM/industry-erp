package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.trade.domain.Settlement;
import com.erp.trade.domain.SettlementType;
import com.erp.trade.dto.SettlementDtos.CreateSettlementRequest;
import com.erp.trade.dto.SettlementDtos.SettlementResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.SettlementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.SettlementDtos;

@Service
@RequiredArgsConstructor
public class SettlementService {

    private final SettlementRepository settlementRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<SettlementResponse> findAll() {
        return settlementRepository.findAllWithPartner().stream()
                .map(SettlementResponse::from)
                .toList();
    }

    @Transactional
    public SettlementResponse create(CreateSettlementRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));

        LocalDate date = req.settleDate() != null ? req.settleDate() : LocalDate.now();

        Settlement s = Settlement.builder()
                .docNo(generateDocNo(req.type(), date))
                .type(req.type())
                .partner(partner)
                .settleDate(date)
                .amount(req.amount())
                .method(req.method())
                .note(req.note())
                .createdBy(username)
                .build();

        return SettlementResponse.from(settlementRepository.save(s));
    }

    private String generateDocNo(SettlementType type, LocalDate date) {
        String prefix = type == SettlementType.RECEIPT ? "RC-" : "PY-";
        return docNoGenerator.next(prefix, "settlements", "doc_no", "settle_date", date);
    }
}
