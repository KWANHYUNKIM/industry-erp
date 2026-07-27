package com.erp.settings.domain.enums;

/** 사용자정의 필드 데이터 형식. */
public enum CustomFieldType {
    TEXT("문자"),
    NUMBER("숫자"),
    DATE("일자"),
    CODE("코드");

    private final String displayName;

    CustomFieldType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
