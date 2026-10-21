package com.erp.accounting.account;

/**
 * 계정등록(E010107) [관련업무] — 원본 라디오 차례 그대로.
 * {@link #RECEIVABLE_PAYABLE} 인 계정만 거래처관리대장 I · II 의 채권(자산) · 채무(부채)로 센다.
 */
public enum AccountRelatedWork {
    NONE("없음"),
    DEPOSIT("예금"),
    BORROWING("차입금"),
    NOTE("어음"),
    TANGIBLE_ASSET("유형고정자산"),
    INTANGIBLE_ASSET("무형고정자산"),
    RECEIVABLE_PAYABLE("채권/채무");

    private final String displayName;

    AccountRelatedWork(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
