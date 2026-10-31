package com.erp.accounting.cost.importcost;

/**
 * 수입비용 전표 여섯 가지(원본 회계 II › 수입비용, 2026-10-14 loginaa 실측 — plans/회계2/수입비용.md).
 * 원본 계정별원장(1689 미착품 · 2519 외상매입금, 2026/05/22 남의 자료)으로 읽은 분개:
 * <pre>
 *   서류징수시  청구서 · 영수증  차) 미착품 금액              / 대) 출금계좌(기본 외상매입금)
 *               세금계산서      차) 미착품 공급가 · 부가세대급금 / 대) 출금계좌 합계
 *   자금지급시  거래대금 · 관세사 차) 외상매입금              / 대) 출금계좌(예금)
 *   통관완료시  본계정대체      차) 구입자산(원재료 · 상품 …)  / 대) 미착품
 * </pre>
 */
public enum ImportCostKind {
    BILL_RECEIPT("수입비용-매입대금청구서수령"),
    TAX_INVOICE("수입비용-세금계산서수령(매입)"),
    GENERAL_RECEIPT("수입비용-일반영수증수령"),
    TRADE_PAYMENT("수입비용-거래대금지급"),
    BROKER_PAYMENT("관세사에지급"),
    TRANSFER("수입비용-본계정대체");

    private final String displayName;

    ImportCostKind(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** 미착품을 쌓는 서류징수시 전표인가. */
    public boolean isDocument() {
        return this == BILL_RECEIPT || this == TAX_INVOICE || this == GENERAL_RECEIPT;
    }

    public boolean isPayment() {
        return this == TRADE_PAYMENT || this == BROKER_PAYMENT;
    }
}
