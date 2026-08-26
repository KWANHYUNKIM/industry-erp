package com.erp.accounting;

import com.erp.accounting.domain.AccountDivision;

import java.util.List;

/**
 * 표준 계정과목 — <b>본사와 모든 회사가 공유하는 기준자료</b>.
 *
 * <p>여기 있는 것 중 상당수는 화면에서 고르라고 두는 게 아니라 <b>코드가 코드값으로 찾아 쓴다.</b>
 * 예를 들어 회계반영은 매출에 108(외상매출금)·255(부가세예수금)를, 매입에 251·135 를 쓰고,
 * 급여이체는 801(급여)·254(예수금)를 쓴다. 그 계정이 없으면
 * {@code "계정과목이 없습니다: 135 (계정과목등록 필요)"} 로 기능 자체가 막힌다.
 *
 * <p><b>한 곳에 모은 이유.</b> 예전에는 이 목록이 {@code DataInitializer} 안에만 있었고,
 * 그건 <b>기본 스키마에서만</b> 돈다. 그래서 새로 만든 회사는 계정과목이 0개인 채로 시작해
 * 회계반영·급여이체를 아예 못 했다. 본사에서는 그 계정들이 이미 만들어져 있어 드러나지 않았다.
 * 이제 본사 시더와 테넌트 시더가 <b>같은 목록</b>을 쓴다.
 *
 * <p>업체가 계정을 더 만드는 건 자유다. 여기 있는 것은 지우면 기능이 멈추는 최소 집합이다.
 */
public final class StandardAccounts {

    private StandardAccounts() {}

    /** @param usedByCode 코드가 코드값으로 찾아 쓰는 계정인가. 지우면 그 기능이 멈춘다. */
    public record Spec(String code, String name, AccountDivision division, String detail, boolean usedByCode) {}

    private static Spec of(String code, String name, AccountDivision d, String detail) {
        return new Spec(code, name, d, detail, false);
    }

    /** 코드가 직접 찾아 쓰는 계정. 새 회사에 없으면 해당 기능이 곧바로 막힌다. */
    private static Spec required(String code, String name, AccountDivision d, String detail) {
        return new Spec(code, name, d, detail, true);
    }

    public static final List<Spec> ALL = List.of(
            // ── 자산
            required("101", "현금", AccountDivision.ASSET, "유동자산"),
            of("102", "당좌예금", AccountDivision.ASSET, "유동자산"),
            required("103", "보통예금", AccountDivision.ASSET, "유동자산"),
            required("104", "받을수표", AccountDivision.ASSET, "유동자산"),
            required("108", "외상매출금", AccountDivision.ASSET, "매출채권"),
            required("110", "받을어음", AccountDivision.ASSET, "매출채권"),
            required("134", "가지급금", AccountDivision.ASSET, "유동자산"),
            required("135", "부가세대급금", AccountDivision.ASSET, "유동자산"),
            required("146", "상품", AccountDivision.ASSET, "재고자산"),
            required("203", "감가상각누계액", AccountDivision.ASSET, "유형자산"),   // 자산 차감계정
            of("206", "기계장치", AccountDivision.ASSET, "유형자산"),
            of("208", "차량운반구", AccountDivision.ASSET, "유형자산"),
            of("212", "비품", AccountDivision.ASSET, "유형자산"),
            // ── 부채
            required("251", "외상매입금", AccountDivision.LIABILITY, "매입채무"),
            required("252", "지급어음", AccountDivision.LIABILITY, "매입채무"),
            required("253", "미지급금", AccountDivision.LIABILITY, "유동부채"),
            required("254", "예수금", AccountDivision.LIABILITY, "유동부채"),
            required("255", "부가세예수금", AccountDivision.LIABILITY, "유동부채"),
            // ── 자본
            of("331", "자본금", AccountDivision.EQUITY, "자본금"),
            // ── 수익
            required("401", "상품매출", AccountDivision.REVENUE, "매출액"),
            of("901", "이자수익", AccountDivision.REVENUE, "영업외수익"),
            of("904", "임대료수입", AccountDivision.REVENUE, "영업외수익"),
            of("930", "잡이익", AccountDivision.REVENUE, "영업외수익"),
            required("914", "유형자산처분이익", AccountDivision.REVENUE, "영업외수익"),
            // ── 비용
            of("451", "상품매출원가", AccountDivision.EXPENSE, "매출원가"),
            required("801", "급여", AccountDivision.EXPENSE, "판매관리비"),
            of("811", "복리후생비", AccountDivision.EXPENSE, "판매관리비"),
            of("812", "여비교통비", AccountDivision.EXPENSE, "판매관리비"),
            of("814", "통신비", AccountDivision.EXPENSE, "판매관리비"),
            of("815", "수도광열비", AccountDivision.EXPENSE, "판매관리비"),
            required("818", "감가상각비", AccountDivision.EXPENSE, "판매관리비"),
            of("830", "소모품비", AccountDivision.EXPENSE, "판매관리비"),
            of("831", "지급수수료", AccountDivision.EXPENSE, "판매관리비"),
            of("833", "광고선전비", AccountDivision.EXPENSE, "판매관리비"),
            required("835", "대손상각비", AccountDivision.EXPENSE, "판매관리비"),
            required("936", "매출채권처분손실", AccountDivision.EXPENSE, "영업외비용"),
            required("970", "유형자산처분손실", AccountDivision.EXPENSE, "영업외비용"));
}
