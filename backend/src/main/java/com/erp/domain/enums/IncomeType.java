package com.erp.domain.enums;

import java.math.BigDecimal;

/**
 * 기타원천세의 소득구분. 세율과 필요경비율이 구분마다 다르다.
 *
 * <p>사업소득 3%(지방세 포함 3.3%), 기타소득은 필요경비 60% 를 뺀 나머지에 20%(실효 8.8%),
 * 이자·배당은 14%(15.4%). 지방소득세는 어느 경우든 소득세의 10%.
 */
public enum IncomeType {
    BUSINESS("사업소득", new BigDecimal("0.03"), BigDecimal.ZERO),
    OTHER("기타소득", new BigDecimal("0.20"), new BigDecimal("0.60")),
    INTEREST("이자소득", new BigDecimal("0.14"), BigDecimal.ZERO),
    DIVIDEND("배당소득", new BigDecimal("0.14"), BigDecimal.ZERO);

    private final String displayName;
    private final BigDecimal taxRate;
    /** 필요경비율. 기타소득만 60% */
    private final BigDecimal expenseRate;

    IncomeType(String displayName, BigDecimal taxRate, BigDecimal expenseRate) {
        this.displayName = displayName;
        this.taxRate = taxRate;
        this.expenseRate = expenseRate;
    }

    public String getDisplayName() {
        return displayName;
    }

    public BigDecimal getTaxRate() {
        return taxRate;
    }

    public BigDecimal getExpenseRate() {
        return expenseRate;
    }
}
