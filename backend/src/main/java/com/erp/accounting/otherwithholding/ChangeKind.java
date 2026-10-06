package com.erp.accounting.otherwithholding;

/** 이자배당 지급명세서의 변동자료구분 — 원본 선택지 그대로(기본 처음제출되는자료). */
public enum ChangeKind {
    FIRST("처음제출되는자료"),
    DELETE("삭제[기제출정정]"),
    AMEND_OLD("수정[서식개정전]"),
    AMEND_NEW("수정[서식개정후]"),
    ;

    private final String displayName;

    ChangeKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
