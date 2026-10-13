package com.erp.accounting.fastvoucher;

/** FastEntry 간편전표 종류. */
public enum FastVoucherType {
    EXPENSE_REPORT("지출결의서"),
    DEPOSIT_REPORT("입금보고서"),
    ADVANCE_SETTLEMENT("가지급금정산서"),
    /** 원본 현금예금출금 › 영수증으로(E010402) — 출금계좌 · 계정 · 거래처명(글자) · 금액 · 수수료 한 장. */
    RECEIPT_PAYMENT("영수증으로"),

    /*
     * 원본 회계 I › 현금거래의 한 장짜리 입력(2026-10-12 loginaa 실측). 이름은 원본 회계거래조회 [거래유형] 글자 그대로다
     * — 일시적으로는 입금 · 출금이 '입금-일시적으로' · '출금-일시적으로' 로 갈린다.
     */
    /** 매출처로부터(E010404): 차) 입금계좌 금액 · 지급수수료 수수료 / 대) 외상매출금 금액+수수료. */
    SALES_COLLECTION("매출처로부터"),
    /** 카드매출대금회수(E010405): 차) 입금계좌 통장입금액 · 지급수수료 수수료 / 대) 미수금(카드사) 총금액. */
    CARD_SALES_COLLECTION("카드매출대금회수"),
    /** 일시적으로(입금)(E010401): 차) 입금계좌 금액 · 지급수수료 수수료 / 대) 가지급금(사원) 금액+수수료. */
    TEMP_DEPOSIT("입금-일시적으로"),
    /** 은행차입으로(E010406): 차) 입금계좌 총차입금−수수료 · 이자비용 수수료 / 대) 차입처 계좌 총차입금. */
    BANK_BORROWING("은행차입으로"),
    /** 기타입금(E010407): 차) 입금계좌 금액 / 대) 대변계정 금액. */
    OTHER_DEPOSIT("기타입금"),
    /** 매입처로(E010409): 차) 외상매입금 금액 · 지급수수료 수수료 / 대) 출금계좌 금액+수수료. */
    PURCHASE_PAYMENT("매입처로"),
    /** 법인카드대금결제(E010412): 차) 미지급금(카드) 금액 · 지급수수료 수수료 / 대) 출금계좌 금액+수수료. */
    CARD_BILL_PAYMENT("법인카드대금결제"),
    /** 계좌간이동(E010411): 차) 입금계좌 금액 · 지급수수료 수수료 / 대) 출금계좌 금액+수수료. */
    ACCOUNT_TRANSFER("계좌간이동"),
    /** 일시적으로(출금)(E010410): 차) 가지급금(사원) 금액 · 지급수수료 수수료 / 대) 출금계좌 금액+수수료. */
    TEMP_WITHDRAW("출금-일시적으로"),
    /** 은행으로(E010413): 차) 차입처 계좌 원금상환액 · 이자비용 이자금액 / 대) 출금계좌 합계. */
    LOAN_REPAYMENT("은행으로"),
    /** 기타출금(E010414): 차) 차변계정 금액 · 지급수수료 수수료 / 대) 출금계좌 금액+수수료. 현금이면 수수료를 못 넣는다. */
    OTHER_WITHDRAW("기타출금"),

    /*
     * 원본 회계 I › 비현금거래(2026-10-13 loginaa 실측) — 돈이 오가지 않는 한 장짜리 입력. 이름은 회계거래조회 [거래유형] 글자 그대로.
     */
    /** 증빙만수령 › 일반영수증(E010501 '영수증만수령-현재자금의 이동 없이 영수증만 가져온 경우'): 차) 계정 / 대) 가지급금(사원). */
    RECEIPT_ONLY("일반영수증"),
    /** 증빙만수령 › 신용카드전표('카드전표수령-신용카드전표를 받은 경우'): 차) 계정 / 대) 미지급금(카드). */
    CARD_SLIP("신용카드전표"),
    /** 기타(E010503 '기타-자금의이동없는경우'): 차) 차변계정 / 대) 대변계정. */
    NONCASH_OTHER("기타");

    private final String displayName;

    FastVoucherType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 현금거래 한 장짜리 입력인가(줄 하나 + 머리 계좌 · 수수료로 분개를 정한다). */
    public boolean isCashQuick() {
        return ordinal() >= SALES_COLLECTION.ordinal();
    }

    /** 비현금거래 — 머리 계좌가 없고 계좌 입출금도 없다. */
    public boolean isNonCash() {
        return ordinal() >= RECEIPT_ONLY.ordinal();
    }

    /** 돈이 들어오는 쪽인가 — 머리 계좌가 [입금계좌]다. */
    public boolean isCashIn() {
        return switch (this) {
            case SALES_COLLECTION, CARD_SALES_COLLECTION, TEMP_DEPOSIT, BANK_BORROWING, OTHER_DEPOSIT, ACCOUNT_TRANSFER -> true;
            default -> false;
        };
    }
}
