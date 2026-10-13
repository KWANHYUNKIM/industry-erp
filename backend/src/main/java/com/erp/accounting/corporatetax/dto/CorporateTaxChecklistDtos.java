package com.erp.accounting.corporatetax.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 법인세Checklist(E030401) */
public class CorporateTaxChecklistDtos {

    /**
     * 원본 기준연도 한 해의 체크리스트. [1. 부가세신고서 내역]은 저장한 부가세신고서 한 장이 한 행인데
     * 우리에게는 부가세신고서를 저장하는 화면이 없어 싣지 않는다(화면은 '등록된 데이터가 없습니다.').
     */
    public record ChecklistResponse(int year, List<SalesMonth> sales, List<PayrollMonth> payroll) {}

    /**
     * [2. 손익계산서 매출계정 내역] 한 달. 원본 2026 실측: 분기만집계 = 그 분기 석 달 합(분기 끝 달에만),
     * 분기별집계 = 1월부터 분기 끝 달까지 누계, 반기별집계 = 1월부터 6 · 12월까지 누계, 합계 = 12월에 한 해 합계.
     * 칸이 없는 달은 null.
     */
    public record SalesMonth(int month, BigDecimal sales, BigDecimal quarterOnly, BigDecimal quarterCumulative,
                             BigDecimal halfCumulative, BigDecimal total) {}

    /** [3. 급여 및 원천세 내역] 한 달. 차액 = 원천세 신고금액 − 급여총액. */
    public record PayrollMonth(int month, BigDecimal reported, BigDecimal difference,
                               BigDecimal salary, BigDecimal bonus, BigDecimal incomeTax, BigDecimal localIncomeTax,
                               BigDecimal pension, BigDecimal health, BigDecimal employment) {}

    public record MemoResponse(Long id, int year, int section, LocalDate memoDate, String title, String content, String writer) {}

    public record MemoRequest(
            @NotNull Integer year,
            @NotNull Integer section,
            @NotNull(message = "날짜를 입력해주세요.") LocalDate memoDate,
            @NotBlank(message = "제목을 입력해주세요.") String title,
            @NotBlank(message = "메모를 입력해주세요.") String content
    ) {}
}
