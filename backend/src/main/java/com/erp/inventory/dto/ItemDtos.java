package com.erp.inventory.dto;

import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.ItemCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public final class ItemDtos {

    private ItemDtos() {}

    public record CreateItemRequest(
            @NotBlank(message = "품목코드를 입력하세요.") String code,
            @NotBlank(message = "품명을 입력하세요.") String name,
            String spec,
            @NotBlank(message = "단위를 입력하세요.") String unit,
            @NotNull(message = "품목분류를 선택하세요.") ItemCategory category,
            @NotNull(message = "단가를 입력하세요.") @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            /** 구매(입고) 기준단가. 안 주면 0 — "구매 기준단가를 안 정했다" 는 뜻이다. */
            @PositiveOrZero(message = "구매단가는 0 이상이어야 합니다.") BigDecimal purchasePrice,
            @NotNull(message = "안전재고를 입력하세요.") @PositiveOrZero(message = "안전재고는 0 이상이어야 합니다.") BigDecimal safetyStock,
            String barcode,
            /**
             * 재고수량관리 — 원본 품목등록 리스트의 열('수량관리대상' · '수량관리제외').
             * 안 주면 <b>관리대상</b>이다. 모르고 껐다가 재고가 조용히 안 움직이는 것보다
             * 켜 두고 필요할 때 끄는 쪽이 안전하다.
             */
            Boolean stockTracked,
            /** 의료기기 표준코드(UDI-DI). 있으면 의료기기공급내역보고 대상. */
            String udiDi,
            /** 관리항목 (선택). 전표 라인에는 이 값이 읽기전용으로 따라 붙는다. */
            Long managementItemId,
            /**
             * 그룹 (선택). 엔티티에는 관계가 있는데 <b>요청에만 빠져 있어</b> 아무도 그룹을
             * 지정할 수 없었다 — 그래서 채권/채무현황의 거래처그룹 소계가 늘 '(미지정)' 하나였고,
             * 특별단가의 '그룹별' 도 걸릴 일이 없었다.
             */
            Long itemGroupId
    ) {}

    public record UpdateItemRequest(
            @NotBlank(message = "품명을 입력하세요.") String name,
            String spec,
            @NotBlank(message = "단위를 입력하세요.") String unit,
            @NotNull(message = "품목분류를 선택하세요.") ItemCategory category,
            @NotNull(message = "단가를 입력하세요.")
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            /** 구매(입고) 기준단가. 안 주면 0 — "구매 기준단가를 안 정했다" 는 뜻이다. */
            @PositiveOrZero(message = "구매단가는 0 이상이어야 합니다.") BigDecimal purchasePrice,
            @NotNull(message = "안전재고를 입력하세요.")
            @PositiveOrZero(message = "안전재고는 0 이상이어야 합니다.") BigDecimal safetyStock,
            String barcode,
            /**
             * 재고수량관리 — 원본 품목등록 리스트의 열('수량관리대상' · '수량관리제외').
             * 안 주면 <b>관리대상</b>이다. 모르고 껐다가 재고가 조용히 안 움직이는 것보다
             * 켜 두고 필요할 때 끄는 쪽이 안전하다.
             */
            Boolean stockTracked,
            String udiDi,
            Long managementItemId,
            Long itemGroupId,
            Boolean active
    ) {}

    public record ItemResponse(
            Long id,
            String code,
            String name,
            String spec,
            String unit,
            ItemCategory category,
            String categoryName,
            BigDecimal unitPrice,
            /** 구매(입고) 기준단가. 0 이면 안 정한 것이다. */
            BigDecimal purchasePrice,
            Long itemGroupId,
            String itemGroupName,
            BigDecimal safetyStock,
            String barcode,
            /** 재고수량관리. false 면 재고를 잡지 않는다(용역·운반비 같은 품목). */
            boolean stockTracked,
            String udiDi,
            Long managementItemId,
            String managementItemName,
            boolean active
    ) {
        public static ItemResponse from(Item item) {
            return new ItemResponse(
                    item.getId(),
                    item.getCode(),
                    item.getName(),
                    item.getSpec(),
                    item.getUnit(),
                    item.getCategory(),
                    item.getCategory().getDisplayName(),
                    item.getUnitPrice(),
                    item.getPurchasePrice(),
                    item.getItemGroup() != null ? item.getItemGroup().getId() : null,
                    item.getItemGroup() != null ? item.getItemGroup().getName() : null,
                    item.getSafetyStock(),
                    item.getBarcode(),
                    item.isStockTracked(),
                    item.getUdiDi(),
                    item.getManagementItem() == null ? null : item.getManagementItem().getId(),
                    item.getManagementItem() == null ? null : item.getManagementItem().getName(),
                    item.isActive()
            );
        }
    }
}
