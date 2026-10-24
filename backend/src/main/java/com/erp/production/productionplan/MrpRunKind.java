package com.erp.production.productionplan;

/** 생산계획/MRP 계산 결과 줄의 갈래 — 생산계획계산(만들 품목) · MRP계산(사들일 자재). */
public enum MrpRunKind {
    PLAN("생산계획"),
    MRP("MRP");

    private final String displayName;

    MrpRunKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
