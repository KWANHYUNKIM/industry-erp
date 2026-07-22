package com.erp.quality.domain;

/**
 * 품질검사요청 진행상태. REQUESTED(요청) → INSPECTED(검사완료) 또는 CANCELED(취소).
 * 미검사현황은 REQUESTED 상태의 요청을 말한다.
 */
public enum QualityRequestStatus {
    REQUESTED("요청"),
    INSPECTED("검사완료"),
    CANCELED("취소");

    private final String displayName;

    QualityRequestStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
