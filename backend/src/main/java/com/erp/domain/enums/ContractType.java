package com.erp.domain.enums;

/** 근로계약 유형. 계약직·일용직은 계약 종료일이 반드시 있어야 한다. */
public enum ContractType {
    PERMANENT("정규직"),
    FIXED_TERM("계약직"),
    DAILY("일용직");

    private final String displayName;

    ContractType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 기간제 계약인가 (종료일 필수) */
    public boolean requiresEndDate() {
        return this != PERMANENT;
    }
}
