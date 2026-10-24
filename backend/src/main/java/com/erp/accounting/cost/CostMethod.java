package com.erp.accounting.cost;

/** 원본 원가생성/수정 기본등록의 <b>[원가계산법]</b> — 2026-10-12 실측 차례 그대로. */
public enum CostMethod {
    TOTAL_AVERAGE("총평균법"),
    FIFO("선입선출법"),
    LAST_PURCHASE("최종매입원가법");

    private final String displayName;

    CostMethod(String displayName) { this.displayName = displayName; }

    public String getDisplayName() { return displayName; }
}
