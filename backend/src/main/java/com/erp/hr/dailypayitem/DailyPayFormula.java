package com.erp.hr.dailypayitem;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 일용근로 계산식 셈 — 원본 계산식등록 창의 계산도구(2026-10-21 실측) 그대로:
 * ( ) + - * / · R( 반올림 · C( 절상 · F( 절사 (둘째 값은 자리, -5 ~ 2) · , · Min( · Max(,
 * 그리고 '이름(급여지급사항)' · '이름(근무기록확정)' · '근무기록확정(금액)' · '배율(수당항목)' 같은 항목.
 *
 * <p>항목 이름에 '-' · 괄호가 들어가므로(QA관리-수당(급여지급사항)) 먼저 아는 항목 글자를 긴 것부터 자리표로 바꾼 뒤 셈한다.
 * 모르는 글자가 남으면 {@link IllegalArgumentException}.
 */
public final class DailyPayFormula {

    private DailyPayFormula() {}

    public static BigDecimal evaluate(String formula, Map<String, BigDecimal> vars) {
        List<String> keys = new ArrayList<>(vars.keySet());
        keys.sort(Comparator.comparingInt(String::length).reversed());
        String s = formula;
        List<BigDecimal> slots = new ArrayList<>();
        for (String k : keys) {
            if (!s.contains(k)) continue;
            s = s.replace(k, "{" + slots.size() + "}");
            slots.add(vars.get(k) == null ? BigDecimal.ZERO : vars.get(k));
        }
        Parser p = new Parser(s, slots);
        BigDecimal v = p.expr();
        p.skip();
        if (p.pos < p.s.length()) throw new IllegalArgumentException("계산식이 올바르지 않습니다: " + formula);
        return v;
    }

    private static final class Parser {
        final String s;
        final List<BigDecimal> slots;
        int pos;

        Parser(String s, List<BigDecimal> slots) { this.s = s; this.slots = slots; }

        void skip() { while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++; }

        boolean eat(char c) {
            skip();
            if (pos < s.length() && s.charAt(pos) == c) { pos++; return true; }
            return false;
        }

        void expect(char c) {
            if (!eat(c)) throw new IllegalArgumentException("계산식이 올바르지 않습니다: '" + c + "' 가 없습니다.");
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
            if (pos >= s.length()) throw new IllegalArgumentException("계산식이 올바르지 않습니다.");
            if (eat('-')) return factor().negate();
            if (eat('(')) { BigDecimal v = expr(); expect(')'); return v; }
            char c = s.charAt(pos);
            if (c == '{') {
                int end = s.indexOf('}', pos);
                BigDecimal v = slots.get(Integer.parseInt(s.substring(pos + 1, end)));
                pos = end + 1;
                return v;
            }
            if (Character.isDigit(c) || c == '.') {
                int st = pos;
                while (pos < s.length() && (Character.isDigit(s.charAt(pos)) || s.charAt(pos) == '.' )) pos++;
                return new BigDecimal(s.substring(st, pos));
            }
            for (String fn : new String[]{"Min", "Max", "R", "C", "F"}) {
                if (s.startsWith(fn, pos) && s.substring(pos + fn.length()).stripLeading().startsWith("(")) {
                    pos += fn.length();
                    expect('(');
                    List<BigDecimal> args = new ArrayList<>();
                    args.add(expr());
                    while (eat(',')) args.add(expr());
                    expect(')');
                    return call(fn, args);
                }
            }
            throw new IllegalArgumentException("계산식에 모르는 항목이 있습니다: " + s.substring(pos));
        }

        static BigDecimal call(String fn, List<BigDecimal> a) {
            switch (fn) {
                case "Min": return a.stream().min(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
                case "Max": return a.stream().max(BigDecimal::compareTo).orElse(BigDecimal.ZERO);
                default:
                    int scale = a.size() > 1 ? a.get(1).intValue() : 0;
                    if (scale < -5 || scale > 2) throw new IllegalArgumentException("절상(C)절사(F)로 대체 가능하며, -5~2 범위값만 허용됩니다.");
                    RoundingMode m = fn.equals("R") ? RoundingMode.HALF_UP : fn.equals("C") ? RoundingMode.CEILING : RoundingMode.FLOOR;
                    BigDecimal v = a.get(0).setScale(scale, m);
                    return scale < 0 ? new BigDecimal(v.toBigInteger()) : v;
            }
        }
    }
}
