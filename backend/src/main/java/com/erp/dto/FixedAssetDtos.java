package com.erp.dto;

import com.erp.domain.Depreciation;
import com.erp.domain.FixedAsset;
import com.erp.domain.enums.AssetStatus;
import com.erp.domain.enums.DepreciationMethod;
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
            @NotBlank(message = "자산명을 입력하세요.") String name,
            @NotNull(message = "자산계정을 선택하세요.") Long assetAccountId,
            @NotNull(message = "취득일을 입력하세요.") LocalDate acquisitionDate,
            @NotNull @Positive(message = "취득가액은 0보다 커야 합니다.") BigDecimal acquisitionCost,
            @PositiveOrZero(message = "잔존가액은 0보다 작을 수 없습니다.") BigDecimal salvageValue,
            @NotNull @Positive(message = "내용연수는 1년 이상이어야 합니다.") Integer usefulLifeYears,
            @NotNull(message = "상각방법을 선택하세요.") DepreciationMethod method,
            /** 정률법일 때만. 연 상각률(%) */
            BigDecimal declineRate,
            String remark
    ) {}

    public record DisposeRequest(
            @NotNull(message = "처분일을 입력하세요.") LocalDate disposalDate,
            /** 처분가액(매각대금). 폐기면 0 */
            @NotNull @PositiveOrZero(message = "처분가액은 0보다 작을 수 없습니다.") BigDecimal disposalAmount
    ) {}

    /** 특정 월(yyyy-MM)의 감가상각을 일괄 처리 */
    public record DepreciateRequest(
            @NotBlank(message = "귀속월(yyyy-MM)을 입력하세요.") String period
    ) {}

    public record AssetResponse(
            Long id, String assetNo, String name,
            Long assetAccountId, String assetAccountCode, String assetAccountName,
            LocalDate acquisitionDate, BigDecimal acquisitionCost, BigDecimal salvageValue,
            Integer usefulLifeYears, DepreciationMethod method, String methodName, BigDecimal declineRate,
            BigDecimal accumulatedDepreciation, BigDecimal bookValue,
            AssetStatus status, String statusName,
            LocalDate disposalDate, BigDecimal disposalAmount,
            String remark, String createdBy
    ) {
        public static AssetResponse from(FixedAsset a) {
            return new AssetResponse(
                    a.getId(), a.getAssetNo(), a.getName(),
                    a.getAssetAccount().getId(), a.getAssetAccount().getCode(), a.getAssetAccount().getName(),
                    a.getAcquisitionDate(), a.getAcquisitionCost(), a.getSalvageValue(),
                    a.getUsefulLifeYears(), a.getMethod(), a.getMethod().getDisplayName(), a.getDeclineRate(),
                    a.getAccumulatedDepreciation(), a.bookValue(),
                    a.getStatus(), a.getStatus().getDisplayName(),
                    a.getDisposalDate(), a.getDisposalAmount(),
                    a.getRemark(), a.getCreatedBy());
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
            List<DepreciationResponse> rows
    ) {}
}
