package com.erp.accounting.withholdingpayee;

/** 소득자 구분 — 원본 소득자등록 [구분] 라디오(법인 · 개인, 기본 개인). */
public enum PayeeKind {
    CORPORATE("법 인"),
    INDIVIDUAL("개 인");

    private final String displayName;

    PayeeKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
