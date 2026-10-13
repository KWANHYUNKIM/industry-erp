package com.erp.hr.payroll;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 원본 수당항목 [계산식] 을 푼다 — 계산도구(괄호 · + - * / · R( 반올림 · C( 절상 · F( 절사 · Min( · Max( · 쉼표)와
 * {@code 기본급(급여지급사항)} 처럼 괄호가 붙은 항목 이름.
 *
 * <p>원본 계산식예시(2026-10-13 실측 글자): '소수 첫째 자리에서 반올림 : R(계산식, 0)', '정수 첫째 자리에서 반올림 : R(계산식, -1)',
 * '* 절상(C)절사(F)로 대체 가능하며, -5~2 범위값만 허용됩니다.' 자릿수를 빼면 0 이다({@code R( … )}).
 * 틀린 식을 저장하면 원본은 '계산식이 유효하지 않습니다. / 확인후 다시 설정 바랍니다.' — {@link #INVALID}.
 *
 * <p>원본 공제항목등록 계산식등록의 <b>[조건]</b>(2026-10-13 실측): 계산식등록 줄 끝 [조건] 을 켜면 줄이
 * 조건1 · [참1] · [거짓1] 셋이 되고 계산도구 (조건) AND · OR · = · &gt; · &lt; · &gt;= · &lt;= · &lt;&gt; 가 붙는다. 저장된 글자는
 * {@code [조건1] 장기요양보험(공제구분) > 0, [참1] 건강보험산출금액(계산항목), [거짓1] 건강보험산출금액(계산항목) + 장기요양산출금액(계산항목)}
 * (원본 건강보험). [참] · [거짓] 줄에도 [조건] 칸이 있어 그 안에 [조건2] … 가 다시 올 수 있다 — 되풀이로 푼다.
 * 비교 · AND · OR 의 값은 참 1 · 거짓 0 이다.
 * SUMIFS( 조건부 합계 · [ ] 는 아직 풀지 않는다(쓰면 유효하지 않은 식).
 */
public final class PayFormula {

    public static final String INVALID = "계산식이 유효하지 않습니다.\n확인후 다시 설정 바랍니다.";

    private PayFormula() {}

    /** 항목 이름을 모르거나 문법이 틀리면 IllegalArgumentException(INVALID). */
    public static void validate(String formula, Collection<String> variables) {
        Map<String, BigDecimal> zero = new java.util.HashMap<>();
        for (String v : variables) zero.put(v, BigDecimal.ONE);
        evaluate(formula, zero);
    }

    /** 값을 모르는 항목은 IllegalArgumentException. 0 으로 나누면 0. */
    public static BigDecimal evaluate(String formula, Map<String, BigDecimal> variables) {
        if (formula == null || formula.isBlank()) throw new IllegalArgumentException(INVALID);
        // 원본 찾기 목록은 '소득세(공제)' 로 보이는데 저장된 주민세 식은 'F( ( 소득세(공제구분) * 0.1 ) * 0.1 ) * 10' 이다 — 같은 것으로 본다.
        formula = formula.replace("(공제구분)", "(공제)");
        List<String> names = new ArrayList<>(variables.keySet());
        names.sort(Comparator.comparingInt(String::length).reversed());   // 긴 이름부터 — '기본급(수당)' 과 '기본급(급여지급사항)'
        Parser p = new Parser(formula, names, variables);
        BigDecimal v = p.value();
        p.skip();
        if (p.pos < formula.length()) throw new IllegalArgumentException(INVALID);
        return v;
    }

    private static final class Parser {
        final String s;
        final List<String> names;
        final Map<String, BigDecimal> vars;
        int pos;

        Parser(String s, List<String> names, Map<String, BigDecimal> vars) {
            this.s = s; this.names = names; this.vars = vars;
        }

        void skip() { while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++; }

        boolean eat(char c) {
            skip();
            if (pos < s.length() && s.charAt(pos) == c) { pos++; return true; }
            return false;
        }

        void expect(char c) { if (!eat(c)) throw new IllegalArgumentException(INVALID); }

        /** '[조건N]' · '[참N]' · '[거짓N]' 꼬리표 하나를 먹는다. 없으면 false. */
        boolean tag(String word) {
            skip();
            if (!s.startsWith("[" + word, pos)) return false;
            int at = pos + word.length() + 1;
            int start = at;
            while (at < s.length() && Character.isDigit(s.charAt(at))) at++;
            if (at == start || at >= s.length() || s.charAt(at) != ']') return false;
            pos = at + 1;
            return true;
        }

        /** 식 하나 — '[조건N] 조건, [참N] 값, [거짓N] 값' 이면 조건을 보고 고른다. */
        BigDecimal value() {
            if (!tag("조건")) return logical();
            boolean cond = logical().signum() != 0;
            expect(',');
            if (!tag("참")) throw new IllegalArgumentException(INVALID);
            BigDecimal yes = value();
            expect(',');
            if (!tag("거짓")) throw new IllegalArgumentException(INVALID);
            BigDecimal no = value();
            return cond ? yes : no;
        }

        boolean word(String w) {
            skip();
            if (s.regionMatches(true, pos, w, 0, w.length())) {
                int end = pos + w.length();
                if (end >= s.length() || !Character.isLetterOrDigit(s.charAt(end))) { pos = end; return true; }
            }
            return false;
        }

        BigDecimal logical() {
            BigDecimal v = conj();
            while (word("OR")) {
                BigDecimal r = conj();
                v = (v.signum() != 0 || r.signum() != 0) ? BigDecimal.ONE : BigDecimal.ZERO;
            }
            return v;
        }

        BigDecimal conj() {
            BigDecimal v = compare();
            while (word("AND")) {
                BigDecimal r = compare();
                v = (v.signum() != 0 && r.signum() != 0) ? BigDecimal.ONE : BigDecimal.ZERO;
            }
            return v;
        }

        BigDecimal compare() {
            BigDecimal l = expr();
            skip();
            String op = null;
            for (String o : new String[]{">=", "<=", "<>", "=", ">", "<"}) {
                if (s.startsWith(o, pos)) { op = o; pos += o.length(); break; }
            }
            if (op == null) return l;
            int c = l.compareTo(expr());
            boolean r = switch (op) {
                case ">=" -> c >= 0;
                case "<=" -> c <= 0;
                case "<>" -> c != 0;
                case "=" -> c == 0;
                case ">" -> c > 0;
                default -> c < 0;
            };
            return r ? BigDecimal.ONE : BigDecimal.ZERO;
        }

        BigDecimal expr() {
            BigDecimal v = term();
            while (true) {
                if (eat('+')) v = v.add(term());
                else if (eat('-')) v = v.subtract(term());
                else return v;
            }
        }

        BigDecimal term() {
            BigDecimal v = factor();
            while (true) {
                if (eat('*')) v = v.multiply(factor());
                else if (eat('/')) {
                    BigDecimal d = factor();
                    v = d.signum() == 0 ? BigDecimal.ZERO : v.divide(d, MathContext.DECIMAL64);
                } else return v;
            }
        }

        BigDecimal factor() {
            skip();
            if (pos >= s.length()) throw new IllegalArgumentException(INVALID);
            if (eat('-')) return factor().negate();
            if (eat('(')) { BigDecimal v = logical(); expect(')'); return v; }
            for (String n : names) {                     // 항목 이름이 함수 이름보다 앞선다
                if (s.startsWith(n, pos)) { pos += n.length(); return vars.get(n); }
            }
            for (String fn : new String[]{"Min(", "Max(", "R(", "C(", "F("}) {
                if (s.regionMatches(true, pos, fn, 0, fn.length())) {
                    pos += fn.length();
                    return call(fn.substring(0, fn.length() - 1).toUpperCase());
                }
            }
            int start = pos;
            while (pos < s.length() && (Character.isDigit(s.charAt(pos)) || s.charAt(pos) == '.')) pos++;
            if (start == pos) throw new IllegalArgumentException(INVALID);
            try {
                return new BigDecimal(s.substring(start, pos));
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException(INVALID);
            }
        }

        BigDecimal call(String fn) {
            List<BigDecimal> args = new ArrayList<>();
            args.add(expr());
            while (eat(',')) args.add(expr());
            expect(')');
            switch (fn) {
                case "MIN": return args.stream().min(BigDecimal::compareTo).orElseThrow();
                case "MAX": return args.stream().max(BigDecimal::compareTo).orElseThrow();
                default:
                    if (args.size() > 2) throw new IllegalArgumentException(INVALID);
                    int digits = args.size() == 2 ? args.get(1).intValueExact() : 0;
                    if (digits < -5 || digits > 2) throw new IllegalArgumentException(INVALID);
                    RoundingMode mode = fn.equals("R") ? RoundingMode.HALF_UP : fn.equals("C") ? RoundingMode.CEILING : RoundingMode.FLOOR;
                    return args.get(0).setScale(digits, mode).setScale(Math.max(digits, 0), RoundingMode.UNNECESSARY);
            }
        }
    }
}
