package com.erp.accounting.journal;

/** 회계전표의 생성 출처. */
public enum JournalSourceType {
    SALES("판매"),
    PURCHASE("구매"),
    EXPENSE("지출"),
    BANK("계좌입출금"),
    CARD("카드사용"),
    NOTE("어음"),
    DEPRECIATION("감가상각"),
    DISPOSAL("자산처분"),
    /** 고정자산증가(취득) — 원본 E010611 증가 전표. 차) 자산 · 부가세대급금 / 대) 출금계정(V423). */
    ASSET_ACQUISITION("자산취득"),
    VOUCHER("간편전표"),
    NONCASH("비현금거래"),
    CHECK("수표"),
    PAYROLL("급여이체"),
    ACCOUNT_TRANSFER("계좌간이동"),
    CARD_PAYMENT("카드대금결제"),
    /** 수금·지급(결제) 전표. 원본 결제내역조회의 [회계전표]. */
    SETTLEMENT("수금·지급"),
    /** 생산입고의 외주비 — 외주비일괄회계반영(V220). */
    SUBCONTRACT("외주비"),
    /** 일용직 지급 — 원본 일용근로 급여대장 [전표생성](QA 69회차). */
    DAILY_WAGE("일용직 지급"),
    /** 회계 1 매출/매입거래의 두 전표 — 부가세유형을 든다(V349). */
    VAT_SALES("매출전표 I"),
    VAT_PURCHASE("매입전표 I"),
    /** [매출전표II로 변경] · [매입전표II로 변경] 으로 일반전표 꼴이 된 전표 — 일반전표 화면에서 고친다(V475). */
    VAT_SALES_II("매출전표 II"),
    VAT_PURCHASE_II("매입전표 II"),
    /** 판매일괄회계반영 — 거래처별 여러 판매(또는 판매 줄 일부)를 한 장으로 묶은 매출전표 I. 연결은 journal_entry_sales(V470). */
    SALES_BATCH("매출전표 I"),
    /** 회계 I › FastEntry › 잔액조정입력 — 한쪽(차변 또는 대변)만 있는 전표다(원본 2026-10-14 실측, V396). */
    BALANCE_ADJUST("잔액조정"),
    /** 회계 II › 수입비용 전표 여섯 가지(미착품) — 2026-10-14 원본 실측. */
    IMPORT_COST("수입비용"),
    MANUAL("수동입력");

    private final String displayName;

    JournalSourceType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
