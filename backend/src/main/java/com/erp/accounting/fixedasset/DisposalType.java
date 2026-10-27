package com.erp.accounting.fixedasset;

/** 고정자산감소의 구분 — 원본 E010612 ◉매각 ○폐기. 폐기는 매각액 · 부가세가 없다. */
public enum DisposalType {
    SALE("매각"),
    SCRAP("폐기");

    private final String displayName;

    DisposalType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
