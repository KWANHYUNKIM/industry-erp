package com.erp.service;

import com.erp.domain.Preference;
import com.erp.dto.PreferenceDtos.PreferenceRequest;
import com.erp.dto.PreferenceDtos.PreferenceResponse;
import com.erp.repository.PreferenceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PreferenceService {

    private final PreferenceRepository preferenceRepository;

    /** 환경설정 조회. 미등록 시 엔티티 기본값으로 채운 응답 반환. */
    @Transactional(readOnly = true)
    public PreferenceResponse get() {
        return preferenceRepository.findFirstByOrderByIdAsc()
                .map(PreferenceResponse::from)
                .orElseGet(() -> PreferenceResponse.from(Preference.builder().build()));
    }

    /** 단일 레코드 upsert(있으면 수정, 없으면 생성). null 필드는 기존/기본값 유지. */
    @Transactional
    public PreferenceResponse save(PreferenceRequest req) {
        Preference p = preferenceRepository.findFirstByOrderByIdAsc()
                .orElseGet(() -> Preference.builder().build());

        if (req.fiscalStart() != null) p.setFiscalStart(req.fiscalStart());
        if (req.currency() != null) p.setCurrency(req.currency());
        if (req.decimals() != null) p.setDecimals(req.decimals());
        if (req.negativeStock() != null) p.setNegativeStock(req.negativeStock());
        if (req.autoDocNo() != null) p.setAutoDocNo(req.autoDocNo());
        if (req.lotUse() != null) p.setLotUse(req.lotUse());
        if (req.approvalRequired() != null) p.setApprovalRequired(req.approvalRequired());
        if (req.priceHide() != null) p.setPriceHide(req.priceHide());

        return PreferenceResponse.from(preferenceRepository.save(p));
    }
}
