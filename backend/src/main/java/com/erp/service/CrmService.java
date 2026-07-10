package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.BusinessPartner;
import com.erp.domain.CrmActivity;
import com.erp.domain.CrmStage;
import com.erp.dto.CrmDtos.CreateCrmRequest;
import com.erp.dto.CrmDtos.CrmResponse;
import com.erp.dto.CrmDtos.UpdateCrmRequest;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.CrmActivityRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CrmService {

    private final CrmActivityRepository crmRepository;
    private final BusinessPartnerRepository partnerRepository;

    @Transactional(readOnly = true)
    public List<CrmResponse> findAll() {
        return crmRepository.findAllWithRefs().stream()
                .map(CrmResponse::from)
                .toList();
    }

    @Transactional
    public CrmResponse create(CreateCrmRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("고객사(거래처)를 찾을 수 없습니다. id=" + req.partnerId()));

        CrmActivity activity = CrmActivity.builder()
                .activityDate(req.activityDate() != null ? req.activityDate() : LocalDate.now())
                .partner(partner)
                .contactName(req.contactName())
                .charge(req.charge() != null && !req.charge().isBlank() ? req.charge() : username)
                .activity(req.activity())
                .stage(req.stage() != null ? req.stage() : CrmStage.LEAD)
                .nextAction(req.nextAction())
                .build();
        return CrmResponse.from(crmRepository.save(activity));
    }

    @Transactional
    public CrmResponse update(Long id, UpdateCrmRequest req) {
        CrmActivity activity = crmRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("영업활동을 찾을 수 없습니다. id=" + id));
        if (req.contactName() != null) activity.setContactName(req.contactName());
        if (req.charge() != null) activity.setCharge(req.charge());
        if (req.activity() != null) activity.setActivity(req.activity());
        if (req.stage() != null) activity.setStage(req.stage());
        if (req.nextAction() != null) activity.setNextAction(req.nextAction());
        return CrmResponse.from(activity);
    }

    @Transactional
    public void delete(Long id) {
        CrmActivity activity = crmRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("영업활동을 찾을 수 없습니다. id=" + id));
        crmRepository.delete(activity);
    }
}
