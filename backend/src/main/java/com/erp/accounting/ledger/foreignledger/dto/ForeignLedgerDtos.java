package com.erp.accounting.ledger.foreignledger.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 외화장부(원본 회계 I › 출력물 › 장부 › 외화장부 E010831) 응답. */
public final class ForeignLedgerDtos {
    private ForeignLedgerDtos() {}

    /**
     * 한 줄. 검색구분 [거래처별집계] 면 거래처 × 외화 × 계정마다 한 줄(date · docNo · description 은 비고, 이월 · 증가 · 감소 · 잔액),
     * [건별] 이면 전표 줄마다 한 줄(이월 줄은 kind = CARRY, 계 줄은 kind = TOTAL).
     */
    public record Row(
            String kind,                 // CARRY · LINE · TOTAL · SUM
            LocalDate date, String docNo, String description,
            Long accountId, String accountCode, String accountName,
            Long partnerId, String partnerCode, String partnerName,
            String currencyCode,
            BigDecimal foreignCarry, BigDecimal foreignDebit, BigDecimal foreignCredit, BigDecimal foreignBalance,
            BigDecimal krwCarry, BigDecimal krwDebit, BigDecimal krwCredit, BigDecimal krwBalance
    ) {}

    public record Response(String mode, LocalDate from, LocalDate to, List<Row> rows) {}
}
