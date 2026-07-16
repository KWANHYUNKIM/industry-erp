package com.erp.groupware.domain.enums;

/** 거래처와 맺는 계약 종류. (근로계약은 ContractType 이 따로 있다) */
public enum BusinessContractType {
    SALES("매출계약"),
    PURCHASE("매입계약"),
    OTHER("기타계약");

    private final String displayName;

    BusinessContractType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
