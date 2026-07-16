package com.erp.inventory.domain;

/**
 * 품목 분류. 제조업 기준 표준 구분.
 */
public enum ItemCategory {
    RAW_MATERIAL("원자재"),
    SUB_MATERIAL("부자재"),
    SEMI_FINISHED("반제품"),
    FINISHED("제품"),
    MERCHANDISE("상품");

    private final String displayName;

    ItemCategory(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
