package com.erp.groupware.domain.enums;

/** 메일 처리 상태. 공용메일은 담당자가 배정되면 처리중, 끝나면 처리완료가 된다. */
public enum MailStatus {
    UNREAD("미읽음"),
    READ("읽음"),
    IN_PROGRESS("처리중"),
    HANDLED("처리완료");

    private final String displayName;

    MailStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
