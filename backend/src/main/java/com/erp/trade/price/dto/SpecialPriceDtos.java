package com.erp.trade.price.dto;

import com.erp.trade.price.SpecialPrice;
import com.erp.trade.price.SpecialPriceGroup;
import com.erp.trade.price.SpecialPriceGroupWarehouse;
import com.erp.trade.price.SpecialPriceItemGroup;
import com.erp.trade.price.SpecialPriceType;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 특별단가등록(E040124) — 특별단가그룹 · 품목별 · 품목그룹별 · 적용단가 · 거래처설정 · 창고설정. */
public final class SpecialPriceDtos {

    private SpecialPriceDtos() {}

    // ── 특별단가그룹 ────────────────────────────────────────────
    public record SaveGroupRequest(
            @NotBlank(message = "특별단가그룹코드를 입력 바랍니다.")
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "특별단가그룹명을 입력 바랍니다.")
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String name
    ) {}

    public record GroupResponse(
            Long id, String code, String name, boolean active,
            /** 거래처 · 창고 · 품목 · 품목그룹이 하나라도 붙었나 — 원본은 그 칸 링크를 주황 알약으로 칠한다 */
            boolean hasPartners, boolean hasWarehouses, boolean hasItems, boolean hasItemGroups,
            LocalDateTime updatedAt
    ) {
        public static GroupResponse of(SpecialPriceGroup g, boolean partners, boolean warehouses, boolean items, boolean itemGroups) {
            return new GroupResponse(g.getId(), g.getCode(), g.getName(), g.isActive(),
                    partners, warehouses, items, itemGroups, g.getUpdatedAt());
        }
    }

    // ── 품목별 ──────────────────────────────────────────────
    public record SaveItemPriceRequest(
            @NotNull(message = "특별단가그룹코드를 입력 바랍니다.") Long groupId,
            @NotNull(message = "품목을 입력 바랍니다.") Long itemId,
            @PositiveOrZero(message = "적용단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            boolean vatIncluded,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String remark
    ) {}

    public record ItemPriceResponse(
            Long id,
            Long groupId, String groupCode, String groupName,
            Long itemId, String itemCode, String itemName, String spec, String unit,
            String itemGroupName,
            BigDecimal unitPrice, boolean vatIncluded, boolean active, String remark,
            LocalDateTime updatedAt
    ) {
        public static ItemPriceResponse from(SpecialPrice sp) {
            var i = sp.getItem();
            return new ItemPriceResponse(sp.getId(),
                    sp.getGroup().getId(), sp.getGroup().getCode(), sp.getGroup().getName(),
                    i.getId(), i.getCode(), i.getName(), i.getSpec(), i.getUnit(),
                    i.getItemGroup() != null ? i.getItemGroup().getName() : null,
                    sp.getUnitPrice(), sp.isVatIncluded(), sp.isActive(), sp.getRemark(), sp.getUpdatedAt());
        }
    }

    // ── 품목그룹별 ────────────────────────────────────────────
    public record SaveItemGroupPriceRequest(
            @NotNull(message = "특별단가그룹코드를 입력 바랍니다.") Long groupId,
            @NotNull(message = "품목그룹을 입력 바랍니다.") Long itemGroupId,
            String priceBasis,
            @DecimalMin(value = "-100", message = "조정_비율은 -100 이상이어야 합니다.")
            @DecimalMax(value = "10000", message = "조정_비율은 10000 이하여야 합니다.")
            BigDecimal adjustRate,
            String roundUnit,
            String roundMode
    ) {}

    public record ItemGroupPriceResponse(
            Long id,
            Long groupId, String groupCode, String groupName,
            Long itemGroupId, String itemGroupCode, String itemGroupName,
            String priceBasis, BigDecimal adjustRate, String roundUnit, String roundMode,
            /** 품목그룹별 조정내역 — '출고단가 -6% (소수0자리미만 반올림)' */
            String adjustText,
            boolean active
    ) {
        public static ItemGroupPriceResponse from(SpecialPriceItemGroup g, String adjustText) {
            return new ItemGroupPriceResponse(g.getId(),
                    g.getGroup().getId(), g.getGroup().getCode(), g.getGroup().getName(),
                    g.getItemGroup().getId(), g.getItemGroup().getCode(), g.getItemGroup().getName(),
                    g.getPriceBasis(), g.getAdjustRate(), g.getRoundUnit(), g.getRoundMode(), adjustText, g.isActive());
        }
    }

    // ── 적용단가 ─────────────────────────────────────────────
    public record AppliedPriceRow(
            Long itemId, String itemCode, String itemName, String spec, String itemGroupName,
            /** 구분 — '품목별단가' · '품목그룹별' */
            String kind,
            String groupCode, String groupName,
            String adjustText,
            BigDecimal unitPrice, boolean vatIncluded
    ) {}

    // ── 거래처설정 · 창고설정 ───────────────────────────────────
    public record MemberRequest(
            @NotNull(message = "거래처를 입력 바랍니다.") Long targetId,
            boolean sales,
            boolean purchase
    ) {}

    /** 거래처설정 · 창고설정 격자 한 줄 — 구분(영업 · 구매) · 코드 · 이름 */
    public record MemberResponse(
            Long id, SpecialPriceType tradeType, String tradeTypeName, Long targetId, String code, String name
    ) {
        public static MemberResponse warehouse(SpecialPriceGroupWarehouse w) {
            return new MemberResponse(w.getId(), w.getTradeType(), typeName(w.getTradeType()),
                    w.getWarehouse().getId(), w.getWarehouse().getCode(), w.getWarehouse().getName());
        }

        public static String typeName(SpecialPriceType t) {
            return t == SpecialPriceType.SALES ? "영업" : "구매";
        }
    }

    /** 유효 특별단가 해석 결과. found=false 면 특별단가 없음(기준단가 그대로). */
    public record ResolveResponse(
            boolean found,
            BigDecimal unitPrice,
            /** 걸린 단가적용순서 줄 — '거래처별특별단가(품목별)' … */
            String source,
            String groupCode,
            String groupName,
            boolean vatIncluded
    ) {
        public static ResolveResponse none() {
            return new ResolveResponse(false, null, null, null, null, false);
        }
    }
}
