package com.erp.accounting.fixedasset.dto;

import com.erp.accounting.fixedasset.Depreciation;
import com.erp.accounting.fixedasset.FixedAsset;
import com.erp.accounting.fixedasset.AssetStatus;
import com.erp.accounting.fixedasset.DepreciationMethod;
import com.erp.accounting.fixedasset.DisposalType;
import com.erp.accounting.account.Account;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class FixedAssetDtos {

    private FixedAssetDtos() {}

    public record CreateAssetRequest(
            @Size(max = 100, message = "자산명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "자산명을 입력하세요.") String name,
            @NotNull(message = "자산계정을 선택하세요.") Long assetAccountId,
            @NotNull(message = "취득일을 입력하세요.") LocalDate acquisitionDate,
            @NotNull(message = "취득가액을 입력하세요.") @Positive(message = "취득가액은 0보다 커야 합니다.") BigDecimal acquisitionCost,
            @PositiveOrZero(message = "잔존가액은 0보다 작을 수 없습니다.") BigDecimal salvageValue,
            @NotNull(message = "내용연수를 입력하세요.") @Positive(message = "내용연수는 1년 이상이어야 합니다.") Integer usefulLifeYears,
            @NotNull(message = "상각방법을 선택하세요.") DepreciationMethod method,
            /** 정률법일 때만. 연 상각률(%) */
            BigDecimal declineRate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            /** 감가상각충당금계정 · 감가상각비계정(원본 E010610 자산마다). 비면 203 · 818. */
            Long accumAccountId,
            Long expenseAccountId,
            /** 증가 전표의 출금계좌(원본 E010611, 기본 외상매입금). 비면 취득 분개를 만들지 않는다. */
            Long paymentAccountId,
            @PositiveOrZero(message = "부가세는 0보다 작을 수 없습니다.") BigDecimal acquisitionVat
    ) {}

    /** 고치기 — 등록과 같은 칸. 감가상각이 잡힌 뒤로는 이름 · 적요만 바뀐다(서비스가 막는다). */
    public record UpdateAssetRequest(
            @Size(max = 100, message = "자산명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "자산명을 입력하세요.") String name,
            @NotNull(message = "자산계정을 선택하세요.") Long assetAccountId,
            @NotNull(message = "취득일을 입력하세요.") LocalDate acquisitionDate,
            @NotNull(message = "취득가액을 입력하세요.") @Positive(message = "취득가액은 0보다 커야 합니다.") BigDecimal acquisitionCost,
            @PositiveOrZero(message = "잔존가액은 0보다 작을 수 없습니다.") BigDecimal salvageValue,
            @NotNull(message = "내용연수를 입력하세요.") @Positive(message = "내용연수는 1년 이상이어야 합니다.") Integer usefulLifeYears,
            @NotNull(message = "상각방법을 선택하세요.") DepreciationMethod method,
            BigDecimal declineRate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            Long accumAccountId,
            Long expenseAccountId,
            Long paymentAccountId,
            @PositiveOrZero(message = "부가세는 0보다 작을 수 없습니다.") BigDecimal acquisitionVat
    ) {
        public CreateAssetRequest asCreate() {
            return new CreateAssetRequest(name, assetAccountId, acquisitionDate, acquisitionCost, salvageValue,
                    usefulLifeYears, method, declineRate, remark, accumAccountId, expenseAccountId,
                    paymentAccountId, acquisitionVat);
        }
    }

    public record DisposeRequest(
            @NotNull(message = "처분일을 입력하세요.") LocalDate disposalDate,
            /** 처분가액(매각대금). 폐기면 0 */
            @NotNull(message = "처분가액을 입력하세요.") @PositiveOrZero(message = "처분가액은 0보다 작을 수 없습니다.") BigDecimal disposalAmount,
            /** 원본 E010612 ◉매각 ○폐기. 비면 매각. */
            DisposalType disposalType,
            /** 매각 부가세(부가세예수금). 비면 0. */
            @PositiveOrZero(message = "부가세는 0보다 작을 수 없습니다.") BigDecimal disposalVat,
            /** 입금계좌(원본 기본 외상매출금). 비면 101 현금. */
            Long receiptAccountId
    ) {}

    /** 특정 월(yyyy-MM)의 감가상각을 일괄 처리 */
    public record DepreciateRequest(
            @NotBlank(message = "귀속월(yyyy-MM)을 입력하세요.")
            @Size(max = 7, message = "귀속월은 7자까지 넣을 수 있습니다.") String period
    ) {}

    public record AssetResponse(
            Long id, String assetNo, String name,
            Long assetAccountId, String assetAccountCode, String assetAccountName,
            LocalDate acquisitionDate, BigDecimal acquisitionCost, BigDecimal salvageValue,
            Integer usefulLifeYears, DepreciationMethod method, String methodName, BigDecimal declineRate,
            BigDecimal accumulatedDepreciation, BigDecimal bookValue,
            AssetStatus status, String statusName,
            LocalDate disposalDate, BigDecimal disposalAmount,
            String remark, String createdBy,
            Long accumAccountId, String accumAccountName,
            Long expenseAccountId, String expenseAccountName,
            Long paymentAccountId, String paymentAccountName,
            BigDecimal acquisitionVat,
            DisposalType disposalType, String disposalTypeName, BigDecimal disposalVat,
            Long receiptAccountId, String receiptAccountName
    ) {
        private static Long idOf(Account a) { return a != null ? a.getId() : null; }
        private static String nameOf(Account a) { return a != null ? a.getName() : null; }

        public static AssetResponse from(FixedAsset a) {
            return new AssetResponse(
                    a.getId(), a.getAssetNo(), a.getName(),
                    a.getAssetAccount().getId(), a.getAssetAccount().getCode(), a.getAssetAccount().getName(),
                    a.getAcquisitionDate(), a.getAcquisitionCost(), a.getSalvageValue(),
                    a.getUsefulLifeYears(), a.getMethod(), a.getMethod().getDisplayName(), a.getDeclineRate(),
                    a.getAccumulatedDepreciation(), a.bookValue(),
                    a.getStatus(), a.getStatus().getDisplayName(),
                    a.getDisposalDate(), a.getDisposalAmount(),
                    a.getRemark(), a.getCreatedBy(),
                    idOf(a.getAccumAccount()), nameOf(a.getAccumAccount()),
                    idOf(a.getExpenseAccount()), nameOf(a.getExpenseAccount()),
                    idOf(a.getPaymentAccount()), nameOf(a.getPaymentAccount()),
                    a.getAcquisitionVat(),
                    a.getDisposalType(), a.getDisposalType() != null ? a.getDisposalType().getDisplayName() : null,
                    a.getDisposalVat(),
                    idOf(a.getReceiptAccount()), nameOf(a.getReceiptAccount()));
        }
    }

    public record DepreciationResponse(
            Long id, Long assetId, String assetNo, String assetName,
            String period, LocalDate depreciationDate,
            BigDecimal amount, BigDecimal accumulatedAfter, BigDecimal bookValueAfter,
            Long journalEntryId, String journalDocNo, String createdBy
    ) {
        public static DepreciationResponse from(Depreciation d) {
            return new DepreciationResponse(
                    d.getId(), d.getAsset().getId(), d.getAsset().getAssetNo(), d.getAsset().getName(),
                    d.getPeriod(), d.getDepreciationDate(),
                    d.getAmount(), d.getAccumulatedAfter(), d.getBookValueAfter(),
                    d.getJournalEntry() != null ? d.getJournalEntry().getId() : null,
                    d.getJournalEntry() != null ? d.getJournalEntry().getDocNo() : null,
                    d.getCreatedBy());
        }
    }

    /** 감가상각 실행 결과 요약 */
    public record DepreciationRunResponse(
            String period, int assetCount, BigDecimal totalAmount, int skippedCount,
            List<DepreciationResponse> rows,
            /**
             * 이번 달보다 앞인데 아직 상각하지 않은 달이 있는 자산 — "자산명: 2026-08, 2026-09".
             * 10월을 먼저 돌리면 8·9월이 조용히 빠졌다(34회차). 막지는 않고 알린다.
             */
            List<String> gaps
    ) {}
}
