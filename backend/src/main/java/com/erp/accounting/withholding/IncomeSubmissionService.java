package com.erp.accounting.withholding;

import com.erp.accounting.income.IncomeType;
import com.erp.accounting.otherwithholding.OtherWithholding;
import com.erp.accounting.otherwithholding.OtherWithholdingRepository;
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

/**
 * 소득자료제출집계표(세무 › 원천징수 › 지급명세서 E030508, 2026-10-04 loginaa 실측).
 *
 * <p>원본 2025 · 사업소득: 매수 4 · 건수 10 · 소득(수입)금액 14,926,000 · 소득세 447,780 · 지방소득세 44,770
 * (소득자등록 4명). 작성요령 — 매수는 지급조서 장수(소득자마다 한 장), 건수는 명세 줄 수, 소득금액은 지급액이되
 * 사업 · 기타소득의 소액부징수 제외는 원본 숫자에 적용되지 않아 두지 않았다. 귀속연월로 센다.
 * 사업 · 이자 · 배당 · 기타소득은 기타원천세에서 센다. 연말정산 · 중도정산 · 퇴직소득은 정산 자료가 없어 0 이다.
 */
@Service
@RequiredArgsConstructor
public class IncomeSubmissionService {

    /** 원본 [출력구분] 이름 → 기타원천세 소득구분. 없는 것은 우리에게 자료가 없는 소득. */
    private static final Map<String, IncomeType> KINDS = Map.of(
            "사업소득", IncomeType.BUSINESS, "이자소득", IncomeType.INTEREST,
            "배당소득", IncomeType.DIVIDEND, "기타소득", IncomeType.OTHER);
    private static final List<String> ALL = List.of("연말정산", "중도정산", "연말정산+중도정산", "퇴직소득",
            "사업소득", "이자소득", "배당소득", "기타소득");

    private final OtherWithholdingRepository otherWithholdingRepository;

    @Transactional(readOnly = true)
    public IncomeSubmission summary(String kind, String from, String to) {
        if (!ALL.contains(kind)) throw ApiException.badRequest("출력구분이 올바르지 않습니다: " + kind);
        YearMonth f = month(from), t = month(to);
        IncomeType type = KINDS.get(kind);
        if (type == null) return new IncomeSubmission(kind, 0, 0, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        // 귀속연월로 센다. 원본 2025 사업소득 10줄 14,926,000 은 2026/01/21 지급분(2025/12 귀속)과 세액 330 · 30 원짜리 줄까지 든다 —
        // 작성요령의 '소액부징수 제외' 는 원본 숫자에 적용되지 않았다.
        List<OtherWithholding> rows = otherWithholdingRepository.findByAttributionBetween(f.toString(), t.toString()).stream()
                .filter(w -> w.getIncomeType() == type)
                .toList();
        // [매수] = 지급조서 쪽수 — 소득자 × 업종구분코드(소득코드)마다 한 장. 원본 2025 사업소득: 소득자 셋 중 두뇌발달센터가
        // 940903 학원강사 · 940909 기타자영업 두 코드로 나뉘어 4매(2026-10-04 실측).
        long payees = rows.stream().map(w -> w.getPayeeName() + "\u0000" + Objects.toString(w.getPayeeRegNo(), "")
                + "\u0000" + Objects.toString(w.getIncomeCode(), "")).distinct().count();
        return new IncomeSubmission(kind, (int) payees, rows.size(),
                rows.stream().map(OtherWithholding::getGrossAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                rows.stream().map(OtherWithholding::getIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add),
                rows.stream().map(OtherWithholding::getLocalIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private static YearMonth month(String ym) {
        try {
            return YearMonth.parse(ym);
        } catch (Exception e) {
            throw ApiException.badRequest("귀속연월 형식이 올바르지 않습니다(YYYY-MM): " + ym);
        }
    }
}
