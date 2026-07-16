package com.erp.groupware.domain.enums;

/**
 * 계약 진행 상태.
 * 작성 → 서명요청(상대에게 보냄) → 서명완료(전자서명 기록됨) → (해지)
 */
public enum BusinessContractStatus {
    DRAFT("작성"),
    SENT("서명요청"),
    SIGNED("서명완료"),
    TERMINATED("해지");

    private final String displayName;

    BusinessContractStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
