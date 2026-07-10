package com.erp.domain;

/**
 * 영업활동(CRM) 단계.
 */
public enum CrmStage {
    LEAD("리드"),
    CONSULTING("상담중"),
    QUOTE("견적"),
    CONTRACT("계약"),
    LOST("실패");

    private final String displayName;

    CrmStage(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
