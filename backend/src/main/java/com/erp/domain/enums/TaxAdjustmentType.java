package com.erp.domain.enums;

/** 세무조정 방향. 익금산입·손금불산입은 소득을 늘리고(ADD), 손금산입·익금불산입은 줄인다(DEDUCT). */
public enum TaxAdjustmentType {
    ADD("익금산입·손금불산입"),
    DEDUCT("손금산입·익금불산입");

    private final String displayName;

    TaxAdjustmentType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
