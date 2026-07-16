package com.erp.accounting.domain.enums;

/** 고정자산 상태. */
public enum AssetStatus {
    IN_USE("사용중"),
    DISPOSED("처분");

    private final String displayName;

    AssetStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
