package com.erp.quality.qctype;

/** 원본 검사항목등록의 [형식] — 코드형식 · 숫자형식 · 문자형식(2026-10-12 loginaa 실측). */
public enum QcCheckFormat {
    CODE("코드형식"),
    NUMBER("숫자형식"),
    TEXT("문자형식");

    private final String displayName;

    QcCheckFormat(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
