package com.erp.accounting.simplepayment;

import com.erp.accounting.income.IncomeType;

/** 간이지급명세서 자료구분 — 원본 선택지 차례 그대로. */
public enum SimplePaymentKind {
    LABOR("간이 근로소득", null),
    BUSINESS("간이 거주자 사업소득", IncomeType.BUSINESS),
    OTHER("간이 거주자 기타소득", IncomeType.OTHER),
    /** 지급명세서(일용직, E020146) — 일용근로 출역에서 센다. 간이지급명세서 목록에는 나오지 않는다. */
    DAILY("일용근로소득", null);

    private final String displayName;
    /** 사업 · 기타소득이 읽는 기타원천세의 소득구분. 근로소득은 급여명세, 일용근로소득은 출역을 읽는다. */
    private final IncomeType incomeType;

    SimplePaymentKind(String displayName, IncomeType incomeType) {
        this.displayName = displayName;
        this.incomeType = incomeType;
    }

    public String getDisplayName() { return displayName; }

    public IncomeType getIncomeType() { return incomeType; }
}
