package com.erp.groupware.multislip;

/** 다목적 전표 진행상태 — 원본 알약 [진행중] · [완료]. 새 전표는 진행중. */
public enum MultiSlipStatus {
    IN_PROGRESS("진행중"),
    DONE("완료");

    private final String displayName;

    MultiSlipStatus(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
