package com.erp.trade.domain.enums;

/** 수출 진행단계. 오더 → 통관진행 → 선적완료 → 입금완료. 되돌아가지 않는다. */
public enum ExportStatus {
    ORDER("오더", 0),
    CUSTOMS("통관진행", 1),
    SHIPPED("선적완료", 2),
    PAID("입금완료", 3);

    private final String displayName;
    private final int step;

    ExportStatus(String displayName, int step) {
        this.displayName = displayName;
        this.step = step;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 바로 다음 단계인지. 단계를 건너뛰거나 되돌리는 전이를 막는다. */
    public boolean isNextOf(ExportStatus prev) {
        return this.step == prev.step + 1;
    }
}
