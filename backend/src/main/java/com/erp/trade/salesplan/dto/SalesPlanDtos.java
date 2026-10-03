package com.erp.trade.salesplan.dto;

import com.erp.trade.salesplan.SalesPlan;
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
            /**
             * 원본 매출계획입력 격자의 <b>[단가]</b>. 안 적으면 0이다 — 수량 없이 금액만
             * 잡는 계획도 원본이 허용한다(격자에 금액 칸이 따로 있다).
             */
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            @NotNull(message = "계획금액을 입력하세요.") @PositiveOrZero(message = "계획금액은 0 이상이어야 합니다.") BigDecimal planAmount,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 원본 매출계획입력(E040624) 한 줄 — 거래처 · 담당자 · 품목 · 수량 · 단가 · 예상매출액 · 비고(2026-10-04 실측). */
    public record PlanLineRequest(
            Long partnerId,
            Long employeeId,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @PositiveOrZero(message = "수량은 0 이상이어야 합니다.") BigDecimal planQty,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            @PositiveOrZero(message = "예상매출액은 0 이상이어야 합니다.") BigDecimal planAmount,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String remark
    ) {}

    /** 원본 매출계획입력 전표 — 머리 [예상매출일자] 와 품목 줄. 창고 · 프로젝트는 머리 값으로 줄마다 같이 든다. */
    public record PlanDocRequest(
            @NotNull(message = "예상매출일자를 입력하세요.") java.time.LocalDate expectedDate,
            Long warehouseId,
            Long projectId,
            java.util.List<@jakarta.validation.Valid PlanLineRequest> lines
    ) {}

    public record SalesPlanResponse(
            Long id,
            /** 원본 격자 첫 열 <b>[일자-No.]</b> — 계획 한 줄을 가리키는 이름이다. */
            String planNo, java.time.LocalDate planDate,
            int planYear, int planMonth,
            Long itemId, String itemCode, String itemName, String unit,
            Long employeeId, String employeeName,
            java.time.LocalDate expectedDate,
            BigDecimal planQty, BigDecimal unitPrice, BigDecimal planAmount, String remark, String createdBy,
            /* 원본 매출계획조회 [거래처명 · 창고명 · 프로젝트명] 과 전표 안 줄 차례. */
            int lineNo, Long partnerId, String partnerCode, String partnerName, Long warehouseId, String warehouseName,
            Long projectId, String projectName
    ) {
        public static SalesPlanResponse from(SalesPlan p) {
            return new SalesPlanResponse(
                    p.getId(), p.getPlanNo(), p.getPlanDate(), p.getPlanYear(), p.getPlanMonth(),
                    p.getItem().getId(), p.getItem().getCode(), p.getItem().getName(), p.getItem().getUnit(),
                    p.getEmployee() != null ? p.getEmployee().getId() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getExpectedDate(),
                    p.getPlanQty(), p.getUnitPrice(), p.getPlanAmount(), p.getRemark(), p.getCreatedBy(),
                    p.getLineNo(),
                    p.getPartner() != null ? p.getPartner().getId() : null,
                    p.getPartner() != null ? p.getPartner().getCode() : null,
                    p.getPartner() != null ? p.getPartner().getName() : null,
                    p.getWarehouse() != null ? p.getWarehouse().getId() : null,
                    p.getWarehouse() != null ? p.getWarehouse().getName() : null,
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null);
        }
    }

    /** 매출계획비교표 한 줄: 계획 vs 실적(판매 집계)과 달성률. id 는 계획행 삭제용. */
    /**
     * 원본 매출계획비교표(E040626) 한 줄 — [표시조건1 · 2] 로 묶은 칸과 예상매출(계획) · 매출(판매 공급가액) 금액 · 수량.
     * 표시조건이 없으면 한 줄(기간 전체). 2026-10-04 실측: 9월 예상매출 97,000 · 매출 590,280,000 — 매출은 <b>계획이 없는 판매까지</b>
     * 기간 안 판매 전부의 공급가액이다(판매조회 9/4~9/30 합계 648,648,000 ÷ 1.1 과 맞물린다).
     */
    public record CompareRow(String key1Code, String key1Name, String key2Code, String key2Name,
                             BigDecimal planAmount, BigDecimal planQty, BigDecimal saleAmount, BigDecimal saleQty) {}

    public record ComparisonRow(
            Long id,
            /*
             * 원본 매출계획조회(E040625) 격자의 <b>첫 열 [일자-No.]</b>(2026-09-01 실측).
             * 화면은 진작 그 열을 그리고 있었는데 <b>응답에 싣지 않아 늘 빈칸이었다</b> —
             * 계획 한 줄을 가리킬 이름이 표에 하나도 안 보였다.
             */
            String planNo, java.time.LocalDate planDate,
            /*
             * 원본 조건 [기타]의 <b>[수정일자순(정렬)]</b>. 그 축이 응답에 없어 정렬을 만들 수 없었다.
             * BaseTimeEntity 가 이미 들고 있는 값이라 싣기만 하면 된다.
             */
            java.time.LocalDateTime updatedAt,
            int planYear, int planMonth,
            Long itemId, String itemName, String unit,
            /** 원본 매출계획조회 조건의 <b>[품목구분]</b>. 품목 마스터의 값이라 실어 주기만 한다. */
            com.erp.inventory.item.ItemCategory itemCategory, String itemCategoryName,
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
            /** 원본 매출계획입력 격자의 [수량]·<b>[단가]</b>·[금액]. 셋이 나란히 선다. */
            BigDecimal planQty, BigDecimal unitPrice, BigDecimal planAmount,
            BigDecimal actualQty, BigDecimal actualAmount,
            BigDecimal achieveRate,
            /**
             * 원본 매출계획조회 조건의 [적요] · [최초작성자] · [최초작성일자].
             * SalesPlan 이 셋 다 진작 들고 있는데(remark·createdBy·BaseTimeEntity)
             * 비교표 줄이 안 싣고 있었다 — [최종작업일자]는 위 updatedAt 이 그것이다.
             */
            String remark, String createdBy, java.time.LocalDateTime createdAt
    ) {}
}
