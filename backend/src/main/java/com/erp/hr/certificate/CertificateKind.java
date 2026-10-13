package com.erp.hr.certificate;

/** 각종증명서 종류(원본 E020606 [증명서종류] 드롭다운 차례). */
public enum CertificateKind {
    EMPLOYMENT("재직증명서"),
    RESIGNATION("퇴직증명서"),
    CAREER("경력증명서");

    private final String displayName;

    CertificateKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
