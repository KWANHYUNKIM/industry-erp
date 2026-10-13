package com.erp.hr.payroll;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** 원본 수당항목 [계산식] — 2026-10-13 loginaa 실측 식과 숫자. */
class PayFormulaTest {

    private static final String DEPENDENT = "R( ( 기본급(급여지급사항) * 0.01 * 간이세액표 적용 부양가족수(계산항목) ) )";

    private static BigDecimal eval(String f, Map<String, BigDecimal> v) {
        return PayFormula.evaluate(f, v);
    }

    @Test
    void 부양가족수당_본인1명_38000_세명_114000() {
        assertEquals(0, new BigDecimal("38000").compareTo(eval(DEPENDENT,
                Map.of("기본급(급여지급사항)", new BigDecimal("3800000"), "간이세액표 적용 부양가족수(계산항목)", BigDecimal.ONE))));
        assertEquals(0, new BigDecimal("114000").compareTo(eval(DEPENDENT,
                Map.of("기본급(급여지급사항)", new BigDecimal("3800000"), "간이세액표 적용 부양가족수(계산항목)", new BigDecimal("3")))));
    }

    @Test
    void 변동수당_단가_곱하기_근무기록() {
        String f = "R( 야근수당(급여지급사항) * 야근수당(근무기록확정) , 0 )";
        assertEquals(0, new BigDecimal("37500").compareTo(eval(f,
                Map.of("야근수당(급여지급사항)", new BigDecimal("15000"), "야근수당(근무기록확정)", new BigDecimal("2.5")))));
    }

    @Test
    void 반올림_자릿수_절상_절사_최소_최대() {
        Map<String, BigDecimal> v = Map.of("기본급(수당)", new BigDecimal("1234.5"));
        assertEquals(0, new BigDecimal("1230").compareTo(eval("R(기본급(수당), -1)", v)));
        assertEquals(0, new BigDecimal("1235").compareTo(eval("R(기본급(수당), 0)", v)));
        assertEquals(0, new BigDecimal("1240").compareTo(eval("C(기본급(수당), -1)", v)));
        assertEquals(0, new BigDecimal("1234").compareTo(eval("F(기본급(수당), 0)", v)));
        assertEquals(0, new BigDecimal("1000").compareTo(eval("Min(기본급(수당), 1000)", v)));
        assertEquals(0, new BigDecimal("1234.5").compareTo(eval("Max(기본급(수당), 1000)", v)));
        assertEquals(0, BigDecimal.ZERO.compareTo(eval("기본급(수당) / 0", v)));
    }

    @Test
    void 틀린_식은_유효하지_않다() {
        Map<String, BigDecimal> v = Map.of("기본급(급여지급사항)", BigDecimal.ONE);
        assertThrows(IllegalArgumentException.class, () -> eval("기본급(급여지급사항) *", v));          // 원본 실측: '계산식이 유효하지 않습니다.'
        assertThrows(IllegalArgumentException.class, () -> eval("모르는항목(수당) + 1", v));
        assertThrows(IllegalArgumentException.class, () -> eval("R(기본급(급여지급사항), 3)", v));      // -5~2 범위값만
        assertThrows(IllegalArgumentException.class, () -> eval("( 기본급(급여지급사항)", v));
    }
}
