package com.erp.accounting.yearend;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 원본 정산내역등록/수정(E030109) 귀속 2025 · QA세무-퇴직 세 사례(2026-10-13 loginaa 실측,
 * plans/세무/연말정산.md 4장 표)를 그대로 따라간다. 종(전)근무지 하나 · 부양가족 없음 · 주(현) 기납부 0.
 */
class YearEndTaxCalculatorTest {

    /** A — 총급여 4천만 · 건강/고용 있음. */
    private static YearEndTaxCalculator.Input caseA() {
        return YearEndTaxCalculator.Input.builder().totalPay(40_000_000)
                .nationalPension(1_800_000).healthInsurance(1_418_000).employmentInsurance(360_000)
                .prevTax(1_500_000, 150_000).build();
    }

    /** B — 총급여 6천만 · 건강/고용 없음. */
    private static YearEndTaxCalculator.Builder caseB() {
        return YearEndTaxCalculator.Input.builder().totalPay(60_000_000)
                .nationalPension(2_700_000).prevTax(3_000_000, 300_000);
    }

    @Test
    void 사례A_총급여4천만() {
        var r = YearEndTaxCalculator.calculate(caseA());
        assertEquals(40_000_000, r.totalSalary());
        assertEquals(11_250_000, r.earnedIncomeDeduction());
        assertEquals(28_750_000, r.earnedIncomeAmount());
        assertEquals(1_500_000, r.personalDeduction());
        assertEquals(1_800_000, r.pensionDeduction());
        assertEquals(1_778_000, r.specialIncomeDeduction());
        assertEquals(0, r.otherIncomeDeduction());
        assertEquals(23_672_000, r.taxBase());
        assertEquals(2_290_800, r.computedTax());
        assertEquals(0, r.taxReduction());
        assertEquals(684_000, r.earnedIncomeTaxCredit());
        assertEquals(0, r.standardTaxCredit());
        assertFalse(r.standardChosen());
        assertEquals(684_000, r.taxCreditTotal());
        assertEquals(1_606_800, r.decidedIncomeTax());
        assertEquals(1_500_000, r.prevIncomeTax());
        assertEquals(0, r.currentIncomeTax());
        assertEquals(106_800, r.balanceIncomeTax());
        assertEquals(0, r.decidedRuralTax());
    }

    @Test
    void 사례B_총급여6천만_표준세액공제() {
        var r = YearEndTaxCalculator.calculate(caseB().build());
        assertEquals(60_000_000, r.totalSalary());
        assertEquals(12_750_000, r.earnedIncomeDeduction());
        assertEquals(47_250_000, r.earnedIncomeAmount());
        assertEquals(1_500_000, r.personalDeduction());
        assertEquals(2_700_000, r.pensionDeduction());
        assertEquals(0, r.specialIncomeDeduction());
        assertEquals(43_050_000, r.taxBase());
        assertEquals(5_197_500, r.computedTax());
        assertEquals(660_000, r.earnedIncomeTaxCredit());
        assertTrue(r.standardChosen());
        assertEquals(130_000, r.standardTaxCredit());
        assertEquals(790_000, r.taxCreditTotal());
        assertEquals(4_407_500, r.decidedIncomeTax());
        assertEquals(1_407_500, r.balanceIncomeTax());
    }

    /** 원본: B 에 보장성 1,200,000 만 넣으면 공제 120,000 < 표준 130,000 — 보험료 칸이 비고 표준 130,000 이 남았다. */
    @Test
    void 사례B_보장성만_넣으면_표준이_크다() {
        var r = YearEndTaxCalculator.calculate(caseB().protectionInsurance(1_200_000).build());
        assertTrue(r.standardChosen());
        assertEquals(130_000, r.standardTaxCredit());
        assertEquals(0, r.insuranceCredit());
        assertEquals(0, r.insuranceBase());
        assertEquals(4_407_500, r.decidedIncomeTax());
    }

    @Test
    void 사례C_보장성_의료비_특별세액공제() {
        var r = YearEndTaxCalculator.calculate(caseB().protectionInsurance(1_200_000).medicalSelf(5_000_000).build());
        assertEquals(60_000_000, r.totalSalary());
        assertEquals(43_050_000, r.taxBase());
        assertEquals(5_197_500, r.computedTax());
        assertEquals(660_000, r.earnedIncomeTaxCredit());
        assertFalse(r.standardChosen());
        assertEquals(0, r.standardTaxCredit());
        assertEquals(1_000_000, r.insuranceBase());
        assertEquals(120_000, r.insuranceCredit());
        assertEquals(3_200_000, r.medicalBase());
        assertEquals(480_000, r.medicalCredit());
        assertEquals(1_260_000, r.taxCreditTotal());
        assertEquals(3_937_500, r.decidedIncomeTax());
        assertEquals(393_750, r.decidedLocalTax());
        assertEquals(3_000_000, r.prevIncomeTax());
        assertEquals(300_000, r.prevLocalTax());
        assertEquals(937_500, r.balanceIncomeTax());
        assertEquals(93_750, r.balanceLocalTax());
    }

    /** A 는 특별소득공제(건강 · 고용)가 있어 표준을 고르면 세금이 더 많다 — 특별 쪽이 남는다. */
    @Test
    void 사례A_표준을_고르면_세금이_많다() {
        var r = YearEndTaxCalculator.calculate(caseA());
        assertFalse(r.standardChosen());
        // 표준 쪽: 과세표준 25,450,000 → 산출 2,557,500 − 684,000 − 130,000 = 1,743,500 > 1,606,800
        assertEquals(2_557_500, YearEndTaxCalculator.basicTax(25_450_000));
    }

    @Test
    void 비과세는_총급여에서_빠진다() {
        var r = YearEndTaxCalculator.calculate(YearEndTaxCalculator.Input.builder()
                .totalPay(42_400_000).nonTaxable(2_400_000)
                .nationalPension(1_800_000).healthInsurance(1_418_000).employmentInsurance(360_000)
                .prevTax(1_500_000, 150_000).build());
        assertEquals(40_000_000, r.totalSalary());
        assertEquals(1_606_800, r.decidedIncomeTax());
    }

    @Test
    void 환급은_음수() {
        var r = YearEndTaxCalculator.calculate(caseB().protectionInsurance(1_200_000).medicalSelf(5_000_000)
                .currentTax(1_000_005, 100_000).build());
        // 3,937,500 − 3,000,000 − 1,000,005 = −62,505 → 10원 미만 버림 −62,500
        assertEquals(-62_500, r.balanceIncomeTax());
        assertEquals(-6_250, r.balanceLocalTax());
    }

    @Test
    void 세법_구간() {
        assertEquals(3_500_000, YearEndTaxCalculator.earnedIncomeDeduction(5_000_000));
        assertEquals(7_500_000, YearEndTaxCalculator.earnedIncomeDeduction(15_000_000));
        assertEquals(12_000_000, YearEndTaxCalculator.earnedIncomeDeduction(45_000_000));
        assertEquals(14_750_000, YearEndTaxCalculator.earnedIncomeDeduction(100_000_000));
        assertEquals(20_000_000, YearEndTaxCalculator.earnedIncomeDeduction(1_000_000_000));
        assertEquals(840_000, YearEndTaxCalculator.basicTax(14_000_000));
        assertEquals(6_240_000, YearEndTaxCalculator.basicTax(50_000_000));
        assertEquals(15_360_000, YearEndTaxCalculator.basicTax(88_000_000));
        assertEquals(740_000, YearEndTaxCalculator.earnedIncomeTaxCredit(5_000_000, 30_000_000));
        assertEquals(500_000, YearEndTaxCalculator.earnedIncomeTaxCredit(5_000_000, 120_000_000));
    }
}
