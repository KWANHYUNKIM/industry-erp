package com.erp.domain.enums;

/** 감가상각 방법. */
public enum DepreciationMethod {
    /** 정액법: (취득가액 - 잔존가액) / 내용연수 를 매달 1/12씩 */
    STRAIGHT_LINE("정액법"),
    /** 정률법: 미상각잔액(장부가액) × 상각률 을 매달 1/12씩 */
    DECLINING_BALANCE("정률법");

    private final String displayName;

    DepreciationMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
