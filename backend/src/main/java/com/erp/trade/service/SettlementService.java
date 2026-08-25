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

    /**
     * 정산 전표 삭제.
     *
     * <p>없어서 잘못 넣은 수금·지급을 지울 방법이 아예 없었다. 정산은 거래처 채권·채무 잔액에
     * 그대로 반영되므로, 못 지우면 오타 하나가 잔액을 영구히 틀리게 만든다.
     *
     * <p>재고처럼 되돌릴 것이 없다(정산은 금액만 남긴다). 잔액은 정산 목록을 합쳐서 내므로
     * 행을 지우면 그대로 맞아 들어간다.
     */
    @Transactional
    public void delete(Long id) {
        Settlement s = settlementRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("정산 전표를 찾을 수 없습니다. id=" + id));
        settlementRepository.delete(s);
    }

    private String generateDocNo(SettlementType type, LocalDate date) {
        String prefix = type == SettlementType.RECEIPT ? "RC-" : "PY-";
        return docNoGenerator.next(prefix, "settlements", "doc_no", "settle_date", date);
    }
}
