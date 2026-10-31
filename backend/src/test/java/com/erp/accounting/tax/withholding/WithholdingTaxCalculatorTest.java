package com.erp.accounting.tax.withholding;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 원본 사원등록 [기타설정] → 급여계산 소득세 — 2026-10-13 loginaa 실측값(변종호 2019-002, QA 대장 2026/10 -2).
 */
class WithholdingTaxCalculatorTest {

    private final WithholdingTaxCalculator calc = new WithholdingTaxCalculator();

    private long tax(long taxable, int family, int children, int scale) {
        return calc.monthlyIncomeTax(BigDecimal.valueOf(taxable), family, children, scale).longValueExact();
    }

    @Test
    void 본인만_100퍼센트() {
        // 과세 4,038,000(지급 4,138,000 - 비과세 100,000) · 가족 1 → 198,630 · 지방 19,860
        assertEquals(198_630, tax(4_038_000, 1, 0, 100));
        assertEquals(19_860, calc.localIncomeTax(BigDecimal.valueOf(198_630)).longValueExact());
    }

    @Test
    void 배우자_가족1_자녀1() {
        // 과세 4,114,000 · 본인 + 배우자 + 가족 1 = 3명(표 121,820) - 자녀 1명 20,830 → 100,990 · 지방 10,090
        assertEquals(100_990, tax(4_114_000, 3, 1, 100));
        assertEquals(10_090, calc.localIncomeTax(BigDecimal.valueOf(100_990)).longValueExact());
    }

    @Test
    void 자녀2_80퍼센트() {
        // (121,820 - 45,830) × 80% = 60,792 → 60,790 · 지방 6,070
        assertEquals(60_790, tax(4_114_000, 3, 2, 80));
        assertEquals(6_070, calc.localIncomeTax(BigDecimal.valueOf(60_790)).longValueExact());
    }

    @Test
    void 자녀공제가_세액보다_크면_0() {
        assertEquals(0, tax(1_500_000, 3, 3, 100));
    }
}
