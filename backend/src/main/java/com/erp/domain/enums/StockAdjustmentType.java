package com.erp.domain.enums;

/**
 * 기타이동 유형(창고이동 제외).
 * SELF_USE·DEFECT 는 수량만큼 재고를 차감하고, ADJUST 는 실사수량과 현재고의 차이만큼 증감한다.
 */
public enum StockAdjustmentType {
    SELF_USE("자가사용"),
    DEFECT("불량처리"),
    ADJUST("재고조정");

    private final String displayName;

    StockAdjustmentType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
