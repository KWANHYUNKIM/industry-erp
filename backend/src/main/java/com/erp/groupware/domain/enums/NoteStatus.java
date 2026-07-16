package com.erp.groupware.domain.enums;

/** 어음 상태. 보유 중인 어음만 결제·할인·부도로 넘어갈 수 있다. */
public enum NoteStatus {
    HELD("보유"),
    SETTLED("결제완료"),
    DISCOUNTED("할인"),
    DISHONORED("부도");

    private final String displayName;

    NoteStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 이미 처리가 끝난 어음인지. 종결 상태에서는 어떤 처리도 받지 않는다. */
    public boolean isClosed() {
        return this != HELD;
    }
}
