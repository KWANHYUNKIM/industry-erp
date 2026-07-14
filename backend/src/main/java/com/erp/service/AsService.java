package com.erp.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.domain.AsRequest;
import com.erp.domain.AsStatus;
import com.erp.domain.BusinessPartner;
import com.erp.domain.Item;
import com.erp.dto.AsDtos.AsResponse;
import com.erp.dto.AsDtos.CreateAsRequest;
import com.erp.dto.AsDtos.UpdateAsRequest;
import com.erp.repository.AsRequestRepository;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AsService {

    private final AsRequestRepository asRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemRepository itemRepository;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<AsResponse> findAll() {
        return asRepository.findAllWithRefs().stream().map(AsResponse::from).toList();
    }

    @Transactional
    public AsResponse create(CreateAsRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));

        LocalDate date = req.receiptDate() != null ? req.receiptDate() : LocalDate.now();

        AsRequest as = AsRequest.builder()
                .asNo(generateNo(date))
                .partner(partner)
                .item(item)
                .receiptDate(date)
                .symptom(req.symptom())
                .charge(req.charge())
                .status(AsStatus.RECEIVED)
                .createdBy(username)
                .build();

        return AsResponse.from(asRepository.save(as));
    }

    @Transactional
    public AsResponse update(Long id, UpdateAsRequest req) {
        AsRequest as = asRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("A/S 접수를 찾을 수 없습니다. id=" + id));
        if (req.status() != null) {
            as.setStatus(req.status());
            // 완료로 바뀌면 완료일 자동 설정
            if (req.status() == AsStatus.COMPLETED && as.getDoneDate() == null && req.doneDate() == null) {
                as.setDoneDate(LocalDate.now());
            }
        }
        if (req.charge() != null) as.setCharge(req.charge());
        if (req.repairNote() != null) as.setRepairNote(req.repairNote());
        if (req.doneDate() != null) as.setDoneDate(req.doneDate());
        return AsResponse.from(as);
    }

    private String generateNo(LocalDate date) {
        return docNoGenerator.next("AS-", "as_requests", "as_no", "receipt_date", date);
    }
}
