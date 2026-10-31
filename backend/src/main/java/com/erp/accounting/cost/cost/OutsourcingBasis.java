package com.erp.accounting.cost.cost;

/** 원본 원가생성/수정 기본등록의 <b>[외주비기준]</b>, 목록의 [계산기준] 열이다. */
public enum OutsourcingBasis {
    ITEM("품목등록"),
    ACTUAL("실외주비");

    private final String displayName;

    OutsourcingBasis(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
