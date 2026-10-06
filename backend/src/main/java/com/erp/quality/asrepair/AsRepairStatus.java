package com.erp.quality.asrepair;

/** 원본 [수리진행상태] — 1 진행중(기본) · 완료. 목록 알약도 진행중 – 완료다. */
public enum AsRepairStatus {
    IN_PROGRESS("진행중"), COMPLETED("완료");

    private final String label;

    AsRepairStatus(String label) { this.label = label; }

    public String label() { return label; }
}
