package com.erp.accounting.otherwithholding.dto;

import com.erp.accounting.otherwithholding.OtherWithholding;
import com.erp.accounting.income.IncomeType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class OtherWithholdingDtos {

    public record CreateWithholdingRequest(
            @NotNull(message = "지급일을 입력하세요.") LocalDate payDate,
            @NotNull(message = "소득구분을 선택하세요.") IncomeType incomeType,
            Long partnerId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String payeeName,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String payeeRegNo,
            @NotNull(message = "지급액을 입력하세요.")
            @Positive(message = "지급액은 0보다 커야 합니다.") BigDecimal grossAmount,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String description,
            /** 원본 [귀속연월] YYYY-MM — 비우면 지급일의 연월. */
            @jakarta.validation.constraints.Pattern(regexp = "\\d{4}-\\d{2}", message = "귀속연월 형식이 올바르지 않습니다(YYYY-MM).")
            String attributionMonth,
            /** 원본 [업종구분코드](사업소득 940903 …) / [소득코드](기타소득 60 · 62 · 76 · 79, 이자배당 22). 기타소득 60 은 필요경비가 없다. */
            @jakarta.validation.constraints.Pattern(regexp = "\\d{2,6}", message = "소득코드는 숫자 2~6자리입니다.")
            String incomeCode
    ) {}

    public record OtherWithholdingResponse(
            Long id,
            String docNo,
            LocalDate payDate,
            String attributionMonth,
            IncomeType incomeType,
            String incomeTypeName,
            Long partnerId,
            String payeeName,
            String payeeRegNo,
            String incomeCode,
            BigDecimal grossAmount,
            BigDecimal expenseAmount,
            BigDecimal taxableAmount,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax,
            BigDecimal netAmount,
            String description,
            String createdBy
    ) {
        public static OtherWithholdingResponse from(OtherWithholding w) {
            return new OtherWithholdingResponse(
                    w.getId(), w.getDocNo(), w.getPayDate(), w.getAttributionMonth(),
                    w.getIncomeType(), w.getIncomeType().getDisplayName(),
                    w.getPartner() != null ? w.getPartner().getId() : null,
                    w.getPayeeName(), w.getPayeeRegNo(), w.getIncomeCode(),
                    w.getGrossAmount(), w.getExpenseAmount(), w.getTaxableAmount(),
                    w.getIncomeTax(), w.getLocalIncomeTax(), w.getNetAmount(),
                    w.getDescription(), w.getCreatedBy());
        }
    }

    /** 소득구분별 집계 (원천징수이행상황신고서의 기타원천세 부분) */
    public record IncomeTypeSummary(
            IncomeType incomeType,
            String incomeTypeName,
            int count,
            BigDecimal grossAmount,
            BigDecimal incomeTax,
            BigDecimal localIncomeTax
    ) {}

    public record MonthlySummary(
            String month,
            int count,
            BigDecimal totalGross,
            BigDecimal totalIncomeTax,
            BigDecimal totalLocalIncomeTax,
            BigDecimal totalNet,
            List<IncomeTypeSummary> byIncomeType,
            List<OtherWithholdingResponse> rows
    ) {}

    // ── 원본 기타원천세입력(E030314) — 전표 한 장 · 여러 줄 ─────────────────────────────

    /**
     * 전표 한 줄. 소득자(payeeId)가 없어도 된다(원본에도 빈 줄이 있다). 세율 · 필요경비율은 %.
     * 사업소득은 incomeCode 에 업종구분코드, 기타 · 이자배당은 소득코드.
     */
    public record SlipLineRequest(
            Long payeeId,
            @jakarta.validation.constraints.Pattern(regexp = "\\d{2,6}", message = "소득코드는 숫자 2~6자리입니다.") String incomeCode,
            @NotNull(message = "지급총액을 입력바랍니다.") @Positive(message = "지급총액을 입력바랍니다.") BigDecimal grossAmount,
            @PositiveOrZero(message = "필요경비율이 올바르지 않습니다.") BigDecimal expenseRate,
            @NotNull(message = "세율을 선택바랍니다.") @PositiveOrZero(message = "세율이 올바르지 않습니다.") BigDecimal taxRate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String description,
            /** 사업소득 업종명 — 비우면 코드표 이름. 고쳐 저장할 때 지급 당시 이름(원본 940909 '기타자영업')을 그대로 둔다. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String industryName
    ) {}

    /** 전표 머리 — 지급일자 · 귀속연월 · 지급연월 · 소득구분(이자배당은 INTEREST 로 보내면 소득코드로 이자 · 배당을 가른다). */
    public record SlipRequest(
            @NotNull(message = "지급일자를 입력하세요.") LocalDate payDate,
            @NotNull(message = "귀속연월을 입력하세요.")
            @jakarta.validation.constraints.Pattern(regexp = "\\d{4}-\\d{2}", message = "귀속연월 형식이 올바르지 않습니다(YYYY-MM).") String attributionMonth,
            @NotNull(message = "지급연월을 입력하세요.")
            @jakarta.validation.constraints.Pattern(regexp = "\\d{4}-\\d{2}", message = "지급연월 형식이 올바르지 않습니다(YYYY-MM).") String payMonth,
            @NotNull(message = "소득구분을 선택하세요.") IncomeType incomeType,
            @jakarta.validation.Valid List<SlipLineRequest> lines
    ) {}

    public record SlipLineResponse(
            Long id, int lineNo, Long payeeId, String payeeName, String payeeKindName, String incomeCode, String incomeCodeName,
            BigDecimal grossAmount, BigDecimal expenseRate, BigDecimal expenseAmount, BigDecimal taxableAmount,
            BigDecimal taxRate, BigDecimal incomeTax, BigDecimal localIncomeTax, BigDecimal taxTotal, BigDecimal netAmount,
            String description
    ) {}

    /** 전표 한 장. slipNo 는 원본 표기 그대로 '2025/07/31-2'. */
    public record SlipResponse(
            String slipNo, LocalDate payDate, int slipSeq, String attributionMonth, String payMonth,
            IncomeType incomeType, String incomeTypeName, List<SlipLineResponse> lines
    ) {}

    /** 기타원천세조회 한 줄 — 전표마다. 소득자명은 '두뇌발달센터 외 2건'. */
    public record SlipListRow(
            String slipNo, LocalDate payDate, int slipSeq, String attributionMonth, String payMonth,
            String payeeSummary, IncomeType incomeType, String incomeTypeName,
            BigDecimal grossAmount, BigDecimal taxTotal, BigDecimal netAmount
    ) {}

    /** 기타원천세현황 한 줄 — 지급 줄마다. 사업소득의 소득코드는 원본처럼 '00'. */
    public record LineReportRow(
            String slipNo, LocalDate payDate, int slipSeq, String attributionMonth, String payMonth,
            String payeeName, IncomeType incomeType, String incomeTypeName, String incomeCode,
            BigDecimal grossAmount, BigDecimal incomeAmount, BigDecimal taxRate, BigDecimal taxTotal, String description
    ) {}

    /** 여러 전표를 고를 때(선택삭제) — 지급일자 + 순번. */
    public record SlipKey(@NotNull LocalDate payDate, @NotNull Integer slipSeq) {}

    // ── 원본 원천징수영수증(보관용) E030318 ────────────────────────────────────────

    /** 영수증 한 줄 — 지급 연월일 · 귀속연월 · 지급(총)액 · 필요경비 · 소득금액 · 세율(%) · 소득세 · 지방소득세 · 계. */
    public record ReceiptLine(LocalDate payDate, String attributionMonth, String incomeCode, BigDecimal grossAmount,
                              BigDecimal expenseAmount, BigDecimal taxableAmount, BigDecimal taxRate,
                              BigDecimal incomeTax, BigDecimal localIncomeTax, BigDecimal taxTotal) {}

    /**
     * 소득자 한 사람의 영수증 — 목록 [주민(법인)등록번호 · 소득자명 · 지급총액 · 세액합계] 과 서식 칸(상호 · 사업장소재지 · 성명 ·
     * 주소 · 업종구분 · 소득구분코드). 소득자가 없는 줄은 payeeId null · 이름 빈 한 묶음('-').
     */
    public record ReceiptPayee(Long payeeId, String regNo, String name, String tradeName, String bizRegNo, String address,
                               String bizAddress, boolean foreigner, String industryCode, List<String> incomeCodes,
                               BigDecimal grossAmount, BigDecimal taxTotal, List<ReceiptLine> lines) {}

    // ── 원본 지급명세서(보고용) E030319 ─────────────────────────────────────────────

    /** 2. 소득자 인적사항 및 연간 소득내용 한 줄 — 소득자 × 업종(소득)코드 × 지급연도 × 세율. */
    public record StatementRow(String code, String name, String regNo, boolean foreigner, int payYear, int count,
                               BigDecimal grossAmount, BigDecimal expenseAmount, BigDecimal taxableAmount, BigDecimal taxRate,
                               BigDecimal incomeTax, BigDecimal localIncomeTax, BigDecimal taxTotal) {}

    /** 지급명세서 한 장 — 1. 합계사항(④ 인원 · ⑤ 건수 · ⑥ 지급액 · 소득금액 · 세액) 과 2. 소득자별 줄, 소액부징수(세액 0) 연간 합계. */
    public record PaymentStatement(int year, int payeeCount, int lineCount, BigDecimal grossAmount, BigDecimal taxableAmount,
                                   BigDecimal incomeTax, BigDecimal localIncomeTax, BigDecimal taxTotal,
                                   int smallCount, BigDecimal smallGross, List<StatementRow> rows) {}
}
