package com.erp.hr.contract;

/** 수신정보입력 [전송정보입력] 전달방식 — 원본 Email · SMS · 카카오톡 · 직접서명. 우리는 실제로 보내지 않고 고른 방식만 적는다. */
public enum DeliveryMethod {
    EMAIL("Email"),
    SMS("SMS"),
    KAKAO("카카오톡"),
    DIRECT("직접서명");

    private final String displayName;

    DeliveryMethod(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
