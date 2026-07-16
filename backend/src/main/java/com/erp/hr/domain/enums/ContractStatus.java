package com.erp.hr.domain.enums;

/** 근로계약 진행 상태. 서명(SIGNED)되면 근로조건이 확정되어 수정할 수 없다. */
public enum ContractStatus {
    DRAFT("작성"),
    SENT("발송"),
    SIGNED("서명완료"),
    TERMINATED("해지");

    private final String displayName;

    ContractStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
