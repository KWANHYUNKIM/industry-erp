package com.erp.accounting.promissorynote;

/** 어음 상태. 보유 중인 어음만 결제·할인·부도로 넘어갈 수 있다. */
public enum NoteStatus {
    HELD("보유"),
    SETTLED("결제완료"),
    DISCOUNTED("할인"),
    DISHONORED("부도"),
    /** 원본 [내역만등록] 전표구분 [감소] — 분개 없이 내역만 닫는다(받을어음조회 거래유형 '어음만감소', 2026-10-13 실측). */
    RECORD_DECREASED("어음만감소"),
    /** 받을어음거래처지급(E010603) — 어음을 거래처에 넘겨(배서) 외상매입금을 갚았다. 받을어음조회 거래유형 '받을어음거래처지급'. */
    ENDORSED("거래처지급");

    private final String displayName;

    NoteStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 이미 처리가 끝난 어음인지. 종결 상태에서는 어떤 처리도 받지 않는다. */
    public boolean isClosed() {
        return this != HELD;
    }
}
