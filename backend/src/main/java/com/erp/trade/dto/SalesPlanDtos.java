package com.erp.trade.dto;

import com.erp.trade.domain.SalesPlan;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public final class SalesPlanDtos {

    private SalesPlanDtos() {}

    public record CreateSalesPlanRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            /* 원본 매출계획의 [창고]·[거래처]·[프로젝트]. 안 고르면 그 축을 안 나눈다. */
            Long warehouseId,
            Long partnerId,
            Long projectId,
            /** 원본 매출계획비교표의 [담당자]. 위 셋과 같은 성질의 축이다. */
            Long employeeId,
            /** 원본 매출계획입력의 [예상매출일자]. 안 정해도 된다 — 정하면 계획연월과 맞아야 한다. */
            java.time.LocalDate expectedDate,
            @NotNull(message = "계획연도를 입력하세요.") @Min(value = 2000, message = "연도를 확인하세요.") Integer planYear,
            @NotNull(message = "계획월을 입력하세요.") @Min(value = 1, message = "월은 1~12 입니다.") @Max(value = 12, message = "월은 1~12 입니다.") Integer planMonth,
            @NotNull(message = "계획수량을 입력하세요.") @PositiveOrZero(message = "계획수량은 0 이상이어야 합니다.") BigDecimal planQty,
            @NotNull(message = "계획금액을 입력하세요.") @PositiveOrZero(message = "계획금액은 0 이상이어야 합니다.") BigDecimal planAmount,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record SalesPlanResponse(
            Long id, int planYear, int planMonth,
            Long itemId, String itemCode, String itemName, String unit,
            Long employeeId, String employeeName,
            java.time.LocalDate expectedDate,
            BigDecimal planQty, BigDecimal planAmount, String remark, String createdBy
    ) {
        public static SalesPlanResponse from(SalesPlan p) {
            return new SalesPlanResponse(
                    p.getId(), p.getPlanYear(), p.getPlanMonth(),
                    p.getItem().getId(), p.getItem().getCode(), p.getItem().getName(), p.getItem().getUnit(),
                    p.getEmployee() != null ? p.getEmployee().getId() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getExpectedDate(),
                    p.getPlanQty(), p.getPlanAmount(), p.getRemark(), p.getCreatedBy());
        }
    }

    /** 매출계획비교표 한 줄: 계획 vs 실적(판매 집계)과 달성률. id 는 계획행 삭제용. */
    public record ComparisonRow(
            Long id, int planYear, int planMonth,
            Long itemId, String itemName, String unit,
            Long warehouseId, String warehouseName,
            Long partnerId, String partnerName,
            Long projectId, String projectName,
            Long employeeId, String employeeName,
            /**
             * 원본 [설정]의 <b>[코드포함]</b>. 이름 옆에 코드를 같이 보여 줄 때 쓴다 —
             * 같은 이름의 거래처가 둘일 때 <b>이름만으로는 어느 쪽인지 알 수 없다.</b>
             * 안 나눈 축은 null 이다.
             */
            String itemCode, String warehouseCode, String partnerCode,
            String projectCode, String employeeCode,
            /** 원본 매출계획입력의 [예상매출일자]. 안 정했으면 null. */
            java.time.LocalDate expectedDate,
            BigDecimal planQty, BigDecimal planAmount,
            BigDecimal actualQty, BigDecimal actualAmount,
            BigDecimal achieveRate
    ) {}
}
