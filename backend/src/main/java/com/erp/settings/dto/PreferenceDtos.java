package com.erp.settings.dto;

import com.erp.settings.domain.Preference;

public final class PreferenceDtos {

    private PreferenceDtos() {}

    public record PreferenceRequest(
            String fiscalStart,
            String currency,
            Integer decimals,
            Boolean negativeStock,
            Boolean autoDocNo,
            Boolean lotUse,
            Boolean approvalRequired,
            Boolean priceHide
    ) {}

    public record PreferenceResponse(
            Long id,
            String fiscalStart,
            String currency,
            Integer decimals,
            Boolean negativeStock,
            Boolean autoDocNo,
            Boolean lotUse,
            Boolean approvalRequired,
            Boolean priceHide
    ) {
        public static PreferenceResponse from(Preference p) {
            if (p == null) return null;
            return new PreferenceResponse(
                    p.getId(), p.getFiscalStart(), p.getCurrency(), p.getDecimals(),
                    p.getNegativeStock(), p.getAutoDocNo(), p.getLotUse(),
                    p.getApprovalRequired(), p.getPriceHide());
        }
    }
}
