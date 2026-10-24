package com.erp.quality.asrepair;

/** 원본 A/S수리입력 [수리유형] 코드도움(2026-10-03 loginaa 실측). */
public enum AsRepairType {
    FREE_EXCHANGE("01", "무상교환"),
    FREE_REPAIR("02", "무상수리"),
    PAID_EXCHANGE("05", "유상교환"),
    PAID_REPAIR("06", "유상수리"),
    RETURN("11", "반품");

    private final String code;
    private final String label;

    AsRepairType(String code, String label) { this.code = code; this.label = label; }

    public String code() { return code; }
    public String label() { return label; }
}
