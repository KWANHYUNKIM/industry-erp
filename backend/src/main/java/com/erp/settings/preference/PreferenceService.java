package com.erp.settings.preference;

import com.erp.settings.preference.dto.PreferenceDtos.PreferenceRequest;
import com.erp.settings.preference.dto.PreferenceDtos.PreferenceResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.erp.settings.preference.dto.PreferenceDtos;

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
        if (req.zeroDisplay() != null) p.setZeroDisplay(req.zeroDisplay());
        if (req.clock24() != null) p.setClock24(req.clock24());
        if (req.printAlign() != null) p.setPrintAlign(oneOf(req.printAlign(), "인쇄정렬", "LEFT", "CENTER", "RIGHT"));
        if (req.printOrientation() != null) p.setPrintOrientation(oneOf(req.printOrientation(), "인쇄방향", "PORTRAIT", "LANDSCAPE"));

        return PreferenceResponse.from(preferenceRepository.save(p));
    }

    private static String oneOf(String v, String label, String... allowed) {
        for (String a : allowed) if (a.equals(v)) return v;
        throw new ApiException(HttpStatus.BAD_REQUEST, label + " 값이 올바르지 않습니다.");
    }
}
