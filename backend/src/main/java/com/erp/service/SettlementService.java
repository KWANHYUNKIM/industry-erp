package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.BusinessPartner;
import com.erp.domain.Settlement;
import com.erp.domain.SettlementType;
import com.erp.dto.SettlementDtos.CreateSettlementRequest;
import com.erp.dto.SettlementDtos.SettlementResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.SettlementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SettlementService {

    private final SettlementRepository settlementRepository;
    private final BusinessPartnerRepository partnerRepository;

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
        String prefix = type == SettlementType.RECEIPT ? "RC" : "PY";
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return prefix + "-" + d + "-" + String.format("%04d", settlementRepository.countByType(type) + 1);
    }
}
