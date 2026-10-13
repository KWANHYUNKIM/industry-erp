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

    /** 원본 공제항목 건강보험 식(2026-10-13 실측 글자) — 장기요양 줄이 따로 있으면 건강보험만, 없으면 둘을 더한다. */
    @Test
    void 조건_참_거짓() {
        String f = "[조건1] 장기요양보험(공제구분) > 0, [참1] 건강보험산출금액(계산항목), "
                + "[거짓1] 건강보험산출금액(계산항목) + 장기요양산출금액(계산항목)";
        Map<String, BigDecimal> v = new java.util.HashMap<>(Map.of(
                "장기요양보험(공제)", new BigDecimal("19070"),
                "건강보험산출금액(계산항목)", new BigDecimal("134710"),
                "장기요양산출금액(계산항목)", new BigDecimal("19070")));
        assertEquals(0, new BigDecimal("134710").compareTo(eval(f, v)));
        v.put("장기요양보험(공제)", BigDecimal.ZERO);
        assertEquals(0, new BigDecimal("153780").compareTo(eval(f, v)));
    }

    @Test
    void 조건_안에_조건_AND_OR_비교() {
        Map<String, BigDecimal> v = Map.of("기본급(수당)", new BigDecimal("3000000"));
        String nested = "[조건1] 기본급(수당) >= 3000000 AND 기본급(수당) <> 0, [참1] [조건2] 기본급(수당) < 1, [참2] 1, [거짓2] 2, [거짓1] 3";
        assertEquals(0, new BigDecimal("2").compareTo(eval(nested, v)));
        assertEquals(0, BigDecimal.ONE.compareTo(eval("[조건1] 1 = 2 OR (1 <= 1), [참1] 1, [거짓1] 0", v)));
        assertThrows(IllegalArgumentException.class, () -> eval("[조건1] 1 > 0, [참1] 1", v));   // [거짓1] 이 빠짐
    }

    @Test
    void 주민세_원본식_공제구분은_공제와_같다() {
        String f = "F( ( 소득세(공제구분) * 0.1 ) * 0.1 ) * 10";   // 원본 주민세 — 10원 미만 절사
        assertEquals(0, new BigDecimal("12340").compareTo(eval(f, Map.of("소득세(공제)", new BigDecimal("123456")))));
    }
}
