package com.erp.accounting.journal;

/**
 * 회계전표 진행상태 — 원본 회계거래조회의 탭 [전체 · 결재중 · 미확인 · 확인].
 * [확인] · [확인취소] 단추가 미확인 ↔ 확인을 바꾸고, 결재중은 전자결재가 정한다.
 */
public enum JournalConfirmStatus {
    UNCONFIRMED("미확인"),
    IN_APPROVAL("결재중"),
    CONFIRMED("확인");

    private final String displayName;

    JournalConfirmStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
