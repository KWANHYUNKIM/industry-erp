package com.erp.domain.enums;

/** 어음 구분. 받을어음은 자산, 지급어음은 부채다. */
public enum NoteType {
    RECEIVABLE("받을어음"),
    PAYABLE("지급어음");

    private final String displayName;

    NoteType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public boolean isReceivable() {
        return this == RECEIVABLE;
    }
}
