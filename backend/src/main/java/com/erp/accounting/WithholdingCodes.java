package com.erp.accounting;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 기타원천세 코드표 — 원본 코드도움을 글자 그대로 옮겼다(2026-10-04 loginaa 실측). 소득자등록과 기타원천세입력이 같이 쓴다.
 *
 * <ul>
 *   <li>업종구분코드 40개 — 소득자등록 · 사업소득 줄. 쪽 나눔 없이 이 40개가 전부다.</li>
 *   <li>소득자구분코드(실지명의구분) 16개 — 소득자등록. 이름은 원본 칸에 찍히는 [번호] 열(111 → 주민등록번호).</li>
 *   <li>기타소득 소득코드 19개 — 코드를 고르면 원본이 채우는 기본 필요경비율 · 세율(빈 경비율은 원본도 '====' 로 두고 사람이 고른다).</li>
 * </ul>
 */
public final class WithholdingCodes {

    private WithholdingCodes() {}

    public record Code(String code, String name) {}

    /** 기타소득 소득코드와 기본 필요경비율(%, null = 사람이 고름) · 세율(%). */
    public record OtherIncomeCode(String code, String name, Integer expenseRate, int taxRate) {}

    public static final List<Code> INDUSTRY = List.of(
            new Code("851101", "병의원"),
            new Code("940100", "저술가"),
            new Code("940200", "화가관련"),
            new Code("940301", "작곡가"),
            new Code("940302", "배우"),
            new Code("940303", "모델"),
            new Code("940304", "가수"),
            new Code("940305", "성악가"),
            new Code("940306", "1인미디어콘텐츠창작자"),
            new Code("940500", "연예보조"),
            new Code("940600", "자문·고문"),
            new Code("940901", "바둑기사"),
            new Code("940902", "꽃꽂이교사"),
            new Code("940903", "학원강사"),
            new Code("940904", "직업운동가"),
            new Code("940905", "봉사료수취자"),
            new Code("940906", "보험설계"),
            new Code("940907", "음료배달"),
            new Code("940908", "방판.외판"),
            new Code("940909", "기타인적용역자"),
            new Code("940910", "다단계판매"),
            new Code("940911", "기타모집수당"),
            new Code("940912", "간병인"),
            new Code("940913", "대리운전"),
            new Code("940914", "캐디"),
            new Code("940915", "목욕관리사"),
            new Code("940916", "행사도우미"),
            new Code("940917", "심부름용역"),
            new Code("940918", "퀵서비스"),
            new Code("940919", "물품배달"),
            new Code("940920", "학습지방문강사"),
            new Code("940921", "교육교구방문강사"),
            new Code("940922", "대여제품방문점검원"),
            new Code("940923", "대출모집인"),
            new Code("940924", "신용카드회원모집인"),
            new Code("940925", "방과후강사"),
            new Code("940926", "소프트웨어프리랜서"),
            new Code("940927", "관광통역안내사"),
            new Code("940928", "어린이통학버스기사"),
            new Code("940929", "중고자동차판매원"));

    public static final List<Code> PAYEE_KIND = List.of(
            new Code("111", "주민등록번호"),
            new Code("112", "의료보호증관리번호"),
            new Code("122", "재외국민등록번호"),
            new Code("131", "외국인등록번호"),
            new Code("123", "주민등록번호"),
            new Code("141", "국내거소신고번호"),
            new Code("121", "여권번호,거주지국의 납세번호"),
            new Code("211", "사업자등록번호(고유번호)"),
            new Code("222", "거주지국의 납세번호"),
            new Code("231", "법인식별기호(LEI)"),
            new Code("311", "고유번호"),
            new Code("321", "외국단체등록번호 또는 거주지국의 납세번호"),
            new Code("331", "대표자 주민등록번호"),
            new Code("411", "투자등록증 고유번호"),
            new Code("413", "관련문서번호"),
            new Code("999", "공란"));

    public static final List<OtherIncomeCode> OTHER_INCOME = List.of(
            new OtherIncomeCode("60", "필요경비없는 기타소득[63제외]", 0, 20),
            new OtherIncomeCode("61", "주식매수선택권 행사이익", 0, 0),
            new OtherIncomeCode("62", "그외필요경비있는기타소득 [68·69·71~76제외]", null, 20),
            new OtherIncomeCode("63", "소기업소상공인공제부금해지소득", 0, 15),
            new OtherIncomeCode("64", "서화,골동품 양도소득", 90, 20),
            new OtherIncomeCode("65", "직무발명보상금", null, 20),
            new OtherIncomeCode("68", "비과세기타소득", 0, 0),
            new OtherIncomeCode("69", "분리과세기타소득", null, 20),
            new OtherIncomeCode("71", "상금 및 부상", 80, 20),
            new OtherIncomeCode("72", "광업권 등", 60, 20),
            new OtherIncomeCode("73", "지역권 등", 60, 20),
            new OtherIncomeCode("74", "주택입주지체상금", 80, 20),
            new OtherIncomeCode("75", "원고료 등", 60, 20),
            new OtherIncomeCode("76", "강연료 등", 60, 20),
            new OtherIncomeCode("77", "종교인소득", null, 0),
            new OtherIncomeCode("78", "사례금", 0, 20),
            new OtherIncomeCode("79", "자문료 등", 60, 20),
            new OtherIncomeCode("80", "통신판매 대여소득", 60, 20),
            new OtherIncomeCode("81", "위약금 등", 60, 20));

    private static final Map<String, String> INDUSTRY_NAMES =
            INDUSTRY.stream().collect(Collectors.toMap(Code::code, Code::name));
    private static final Map<String, OtherIncomeCode> OTHER_BY_CODE =
            OTHER_INCOME.stream().collect(Collectors.toMap(OtherIncomeCode::code, Function.identity()));

    /** 업종명 — 모르는 코드면 null. */
    public static String industryName(String code) {
        return code == null ? null : INDUSTRY_NAMES.get(code);
    }

    public static boolean isPayeeKind(String code) {
        return PAYEE_KIND.stream().anyMatch(c -> c.code().equals(code));
    }

    public static OtherIncomeCode otherIncome(String code) {
        return code == null ? null : OTHER_BY_CODE.get(code);
    }
}
