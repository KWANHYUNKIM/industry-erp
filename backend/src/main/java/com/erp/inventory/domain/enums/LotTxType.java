package com.erp.inventory.domain.enums;

/**
 * 로트 입출고 이력 유형. INBOUND(입고): 로트 생성, OUTBOUND(출고): 소모/출고,
 * ADJUST(조정): 실사 등에 의한 증감.
 */
public enum LotTxType {
    INBOUND("입고"),
    OUTBOUND("출고"),
    ADJUST("조정");

    private final String displayName;

    LotTxType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
