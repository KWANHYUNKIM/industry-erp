package com.erp.hr.payroll;

/**
 * 원본 수당항목등록(E090103)의 <b>[비과세유형]</b>. 전액과세가 아니면 그 수당은 과세소득에서 빠진다.
 * 2026-10-03 loginaa 수당리스트에 쓰인 유형만 둔다(원본 코드도움에는 더 있다).
 */
public enum PayTaxFreeType {
    NONE("전액과세"),
    NIGHT_WORK("야간근로수당"),
    CHILDCARE("보육수당"),
    MEAL("식대"),
    VEHICLE("차량유지비");

    private final String displayName;

    PayTaxFreeType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
