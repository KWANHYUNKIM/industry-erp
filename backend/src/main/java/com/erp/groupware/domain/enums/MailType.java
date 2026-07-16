package com.erp.groupware.domain.enums;

/** 메일 구분. */
public enum MailType {
    /** 사내메일: 사용자끼리 주고받는다. 수신자가 반드시 있다. */
    INTERNAL("사내메일"),
    /** 공용메일: 회사 대표 메일함으로 들어온 외부 메일. 담당자를 배정해 처리한다. */
    SHARED("공용메일");

    private final String displayName;

    MailType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
