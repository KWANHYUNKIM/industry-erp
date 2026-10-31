package com.erp.accounting.asset.fixedasset;

/** 고정자산 전표 구분 — 원본 고정자산증가(E010611) · 고정자산감소(E010612). */
public enum MovementKind {
    INCREASE("자산증가"),
    DECREASE("자산감소");

    private final String displayName;

    MovementKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
