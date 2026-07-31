package com.erp.groupware.domain.enums;

/** 스팸 규칙이 무엇을 보고 판단하는지. */
public enum SpamRuleKind {
    FROM_ADDRESS("보낸주소"),
    SUBJECT("제목"),
    BODY("본문");

    private final String displayName;

    SpamRuleKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
