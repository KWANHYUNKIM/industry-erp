package com.erp.accounting.withholding;

import com.erp.accounting.income.IncomeType;
import com.erp.accounting.otherwithholding.OtherWithholding;
import com.erp.accounting.otherwithholding.OtherWithholdingRepository;
import com.erp.accounting.retirementpay.RetirementPay;
import com.erp.accounting.retirementpay.RetirementPayRepository;
import com.erp.accounting.withholdingpayee.PayeeKind;
import com.erp.accounting.yearend.TaxSettlement;
import com.erp.accounting.yearend.TaxSettlementKind;
import com.erp.accounting.yearend.TaxSettlementRepository;
import com.erp.accounting.withholding.dto.WithholdingDtos.IncomeSubmission;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;

/**
 * 소득자료제출집계표(세무 › 원천징수 › 지급명세서 E030508, 2026-10-04 · 2026-10-14 loginaa 실측).
 *
 * <p>원본 2025 · 사업소득: 매수 4 · 건수 10 · 소득(수입)금액 14,926,000 · 소득세 447,780 · 지방소득세 44,770
 * (소득자등록 4명). 작성요령 — 매수는 지급조서 장수(소득자마다 한 장), 건수는 명세 줄 수, 소득금액은 지급액이되
 * 사업 · 기타소득의 소액부징수 줄은 뺀다. 귀속연월로 센다.
 *
 * <ul>
 *   <li>사업 · 이자 · 배당 · 기타소득 — 기타원천세(비거주자 소득자는 빼서 [비거주자사업소득] 으로).
 *       2026-10-14 원본에 QA세무-집계 사업 940909 1,000,000 · 기타 76 500,000(필요경비 300,000) 을 넣으면
 *       사업 +1매 · +1건 · +1,000,000 · +30,000 · +3,000, 기타 +1매 · +1건 · +500,000(지급액 그대로) · +40,000 · +4,000.</li>
 *   <li>퇴직소득 — 퇴직금계산. 귀속연월 = 퇴직일자의 달, 한 줄이 한 장 · 한 건(퇴직금 0 인 줄도 든다).
 *       원본 2026 은 7줄 · 7 · 67,499,637(퇴직금 합) · 2025 는 10줄 · 189,399.</li>
 *   <li>연말정산 · 중도정산 — 정산내역(계산한 것만). 소득종류는 [근로소득], 소득금액 = 총급여 + 비과세, 세액은 결정세액.
 *       원본에 정산 자료가 없어 숫자는 못 쟀다(빈 줄).</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class IncomeSubmissionService {

    /** 원본 [출력구분] 이름 → 기타원천세 소득구분. */
    private static final Map<String, IncomeType> KINDS = Map.of(
            "사업소득", IncomeType.BUSINESS, "이자소득", IncomeType.INTEREST,
            "배당소득", IncomeType.DIVIDEND, "기타소득", IncomeType.OTHER);
    /** 원본 [출력구분] 9가지 — 차례 그대로. */
    public static final List<String> ALL = List.of("연말정산", "중도정산", "연말정산+중도정산", "퇴직소득",
            "사업소득", "이자소득", "배당소득", "기타소득", "비거주자사업소득");

    private final OtherWithholdingRepository otherWithholdingRepository;
    private final RetirementPayRepository retirementPayRepository;
    private final TaxSettlementRepository taxSettlementRepository;

    @Transactional(readOnly = true)
    public IncomeSubmission summary(String kind, String from, String to) {
        return summary(kind, from, to, null, null);
    }

    /** payFrom · payTo — 원본 [지급연월] '사용'(사업 · 이자 · 배당 · 기타소득만). 비우면 지급일로 거르지 않는다. */
    @Transactional(readOnly = true)
    public IncomeSubmission summary(String kind, String from, String to, String payFrom, String payTo) {
        if (!ALL.contains(kind)) throw ApiException.badRequest("출력구분이 올바르지 않습니다: " + kind);
        YearMonth f = month(from), t = month(to);
        Predicate<OtherWithholding> paid = payFrom == null || payTo == null ? w -> true : paidBetween(month(payFrom), month(payTo));
        return switch (kind) {
            case "퇴직소득" -> retirement(f, t);
            case "연말정산" -> settlement(f, t, List.of(TaxSettlementKind.YEAR_END));
            case "중도정산" -> settlement(f, t, List.of(TaxSettlementKind.MID_TERM));
            case "연말정산+중도정산" -> settlement(f, t, List.of(TaxSettlementKind.YEAR_END, TaxSettlementKind.MID_TERM));
            case "비거주자사업소득" -> other("사업기타소득 (비거주자)", f, t,
                    w -> (w.getIncomeType() == IncomeType.BUSINESS || w.getIncomeType() == IncomeType.OTHER) && nonResident(w) && paid.test(w));
            default -> {
                IncomeType type = KINDS.get(kind);
                yield other(kind, f, t, w -> w.getIncomeType() == type && !nonResident(w) && paid.test(w));
            }
        };
    }

    /** 퇴직금계산 — 귀속연월(퇴직일자의 달)로 거른다. 원본 집계표의 세액은 영수증보다 몇 원 크다(아래 '남은 것'). */
    private IncomeSubmission retirement(YearMonth f, YearMonth t) {
        List<RetirementPay> rows = retirementPayRepository.findBetween(f.atDay(1), t.atEndOfMonth());
        return new IncomeSubmission("퇴직소득", "퇴직소득", rows.size(), rows.size(),
                sum(rows.stream().map(RetirementPay::getRetirementPay)),
                sum(rows.stream().map(RetirementPay::getIncomeTax)), BigDecimal.ZERO, BigDecimal.ZERO,
                sum(rows.stream().map(RetirementPay::getLocalIncomeTax)));
    }

    /** 정산내역 — 귀속연도(from 의 해)에 계산한 것. 사원마다 한 장 · 한 건. */
    private IncomeSubmission settlement(YearMonth f, YearMonth t, List<TaxSettlementKind> kinds) {
        List<TaxSettlement> rows = kinds.stream()
                .flatMap(k -> taxSettlementRepository.findByAttributionYearAndKindOrderByIdAsc(f.getYear(), k).stream())
                .filter(s -> s.getCalculatedAt() != null)
                .toList();
        String label = String.join("+", kinds.stream().map(k -> k == TaxSettlementKind.YEAR_END ? "연말정산" : "중도정산").toList());
        return new IncomeSubmission(label, "근로소득", rows.size(), rows.size(),
                BigDecimal.valueOf(rows.stream().mapToLong(s -> s.getTotalSalary() + s.getCurNonTaxable()).sum()),
                BigDecimal.valueOf(rows.stream().mapToLong(TaxSettlement::getDecidedIncomeTax).sum()), BigDecimal.ZERO,
                BigDecimal.valueOf(rows.stream().mapToLong(TaxSettlement::getDecidedRuralTax).sum()),
                BigDecimal.valueOf(rows.stream().mapToLong(TaxSettlement::getDecidedLocalTax).sum()));
    }

    private IncomeSubmission other(String kind, YearMonth f, YearMonth t, Predicate<OtherWithholding> filter) {
        // 귀속연월로 센다. 원본 2025 사업소득 10줄 14,926,000 은 2026/01/21 지급분(2025/12 귀속)과 세액 330 · 30 원짜리 줄까지 든다.
        List<OtherWithholding> rows = otherWithholdingRepository.findByAttributionBetween(f.toString(), t.toString()).stream()
                .filter(filter)
                .toList();
        boolean perLine = !rows.isEmpty() && rows.stream().allMatch(w -> w.getIncomeType() == IncomeType.INTEREST
                || w.getIncomeType() == IncomeType.DIVIDEND);
        // [매수] = 지급조서 쪽수. 사업 · 기타소득은 소득자 × 업종구분코드(소득코드)마다 한 장 — 원본 2025 사업소득은 소득자 셋 중
        // 두뇌발달센터가 940903 학원강사 · 940909 기타자영업 두 코드로 나뉘어 4매. 이자 · 배당소득은 지급마다 한 장 —
        // 원본 2025 이자소득은 김꽃 꽃꽃이 센터 한 곳 · 소득코드 22 세 번이 3매(2026-10-04 실측).
        long pages = perLine ? rows.size() : rows.stream().map(w -> w.getPayeeName() + "\u0000" + Objects.toString(w.getPayeeRegNo(), "")
                + "\u0000" + Objects.toString(w.getIncomeCode(), "")).distinct().count();
        // ⑫ 소득(수입)금액 — 사업 · 기타소득은 소액부징수(소득세 0) 줄을 뺀다(작성요령 4). 원본 2025 기타소득 22건 1,250,171 중
        // 1~18원 시험 줄 18건이 빠져 1,250,000. 매수 · 건수에는 그대로 든다. 기타소득은 필요경비를 빼기 전 지급액이다.
        BigDecimal income = sum(rows.stream().filter(w -> perLine || w.getIncomeTax().signum() > 0).map(OtherWithholding::getGrossAmount));
        // 소득자가 법인이면 세액은 ⑭ 법인세 칸 — 원본 2025 이자소득 779,300 이 법인세에 찍힌다.
        Predicate<OtherWithholding> corp = w -> w.getPayee() != null && w.getPayee().getKind() == PayeeKind.CORPORATE;
        return new IncomeSubmission(kind, kind, (int) pages, rows.size(), income,
                sum(rows.stream().filter(corp.negate()).map(OtherWithholding::getIncomeTax)),
                sum(rows.stream().filter(corp).map(OtherWithholding::getIncomeTax)), BigDecimal.ZERO,
                sum(rows.stream().map(OtherWithholding::getLocalIncomeTax)));
    }

    private static Predicate<OtherWithholding> paidBetween(YearMonth from, YearMonth to) {
        return w -> !w.getPayDate().isBefore(from.atDay(1)) && !w.getPayDate().isAfter(to.atEndOfMonth());
    }

    private static boolean nonResident(OtherWithholding w) {
        return w.getPayee() != null && w.getPayee().isNonResident();
    }

    private static BigDecimal sum(java.util.stream.Stream<BigDecimal> s) {
        return s.map(v -> v == null ? BigDecimal.ZERO : v).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static YearMonth month(String ym) {
        try {
            return YearMonth.parse(ym);
        } catch (Exception e) {
            throw ApiException.badRequest("귀속연월 형식이 올바르지 않습니다(YYYY-MM): " + ym);
        }
    }
}
