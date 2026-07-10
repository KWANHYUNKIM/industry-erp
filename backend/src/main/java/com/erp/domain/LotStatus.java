package com.erp.domain;

/** 로트/시리얼 상태. */
public enum LotStatus {
    IN_STOCK("재고"),
    SHIPPED("출고완료"),
    HOLD("보류");

    private final String displayName;

    LotStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
