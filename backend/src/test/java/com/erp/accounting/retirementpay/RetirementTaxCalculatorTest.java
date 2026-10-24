package com.erp.accounting.retirementpay;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** 원본 퇴직금계산(E030117) 김은빈 한 건(2026-10-03 loginaa 실측)을 그대로 따라간다. */
class RetirementTaxCalculatorTest {

    private static final LocalDate START = LocalDate.of(2025, 1, 1);
    private static final LocalDate RETIRE = LocalDate.of(2026, 9, 10);

    @Test
    void 일수와_근속() {
        assertEquals(92, RetirementTaxCalculator.workDays3m(RETIRE));
        assertEquals(618, RetirementTaxCalculator.serviceDays(START, RETIRE));
        assertEquals(21, RetirementTaxCalculator.serviceMonths(START, RETIRE));
        assertEquals(2, RetirementTaxCalculator.serviceYears(21));
        assertEquals(1, RetirementTaxCalculator.serviceYears(3));
    }

    @Test
    void 퇴직산출액() {
        assertEquals(new BigDecimal("8778618"),
                RetirementTaxCalculator.retirementPay(new BigDecimal("15900000"), 92, 618, RETIRE));
    }

    @Test
    void 퇴직소득세() {
        var t = RetirementTaxCalculator.tax(new BigDecimal("8778618"), 2);
        assertEquals(new BigDecimal("2000000"), t.serviceDeduction());
        assertEquals(new BigDecimal("40671708"), t.converted());
        assertEquals(new BigDecimal("27603024"), t.convertedDeduction());
        assertEquals(new BigDecimal("13068684"), t.taxBase());
        assertEquals(new BigDecimal("784121"), t.convertedTax());
        assertEquals(new BigDecimal("130686"), t.computedTax());
        assertEquals(new BigDecimal("130680"), t.incomeTax());
        assertEquals(new BigDecimal("13060"), t.localIncomeTax());
    }
}
