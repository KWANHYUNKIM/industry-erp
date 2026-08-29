package com.erp.inventory.dto;

import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.ItemCategory;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public final class ItemDtos {

    private ItemDtos() {}

    public record CreateItemRequest(
            @Size(max = 50, message = "품목코드는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "품목코드를 입력하세요.") String code,
            @Size(max = 200, message = "품명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "품명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String spec,
            @Size(max = 20, message = "단위는 20자까지 넣을 수 있습니다.")
            @NotBlank(message = "단위를 입력하세요.") String unit,
            @NotNull(message = "품목분류를 선택하세요.") ItemCategory category,
            @NotNull(message = "단가를 입력하세요.") @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            /** 구매(입고) 기준단가. 안 주면 0 — "구매 기준단가를 안 정했다" 는 뜻이다. */
            @PositiveOrZero(message = "구매단가는 0 이상이어야 합니다.") BigDecimal purchasePrice,
            @NotNull(message = "안전재고를 입력하세요.") @PositiveOrZero(message = "안전재고는 0 이상이어야 합니다.") BigDecimal safetyStock,
            /**
             * 원본 품목등록 리스트의 [구매처명] — 이 품목을 늘 사 오는 곳 (선택).
             * inventory 가 trade 를 참조할 수 없어 id 만 든다. 이름은 화면이 붙인다.
             */
            Long supplierId,
            /**
             * 원본 품목등록 리스트의 [이미지] — 품목 사진 파일 id (선택).
             * 파일은 POST /api/files 로 먼저 올린다(기안서 첨부와 같은 흐름).
             */
            Long imageFileId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String barcode,
            /** 원본 품목등록 리스트의 [검색창내용]. 부르는 이름으로 찾게 한다. */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String searchKeyword,
            /**
             * 재고수량관리 — 원본 품목등록 리스트의 열('수량관리대상' · '수량관리제외').
             * 안 주면 <b>관리대상</b>이다. 모르고 껐다가 재고가 조용히 안 움직이는 것보다
             * 켜 두고 필요할 때 끄는 쪽이 안전하다.
             */
            Boolean stockTracked,
            /** 의료기기 표준코드(UDI-DI). 있으면 의료기기공급내역보고 대상. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
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
            @Size(max = 200, message = "품명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "품명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String spec,
            @Size(max = 20, message = "단위는 20자까지 넣을 수 있습니다.")
            @NotBlank(message = "단위를 입력하세요.") String unit,
            @NotNull(message = "품목분류를 선택하세요.") ItemCategory category,
            @NotNull(message = "단가를 입력하세요.")
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            /** 구매(입고) 기준단가. 안 주면 0 — "구매 기준단가를 안 정했다" 는 뜻이다. */
            @PositiveOrZero(message = "구매단가는 0 이상이어야 합니다.") BigDecimal purchasePrice,
            @NotNull(message = "안전재고를 입력하세요.")
            @PositiveOrZero(message = "안전재고는 0 이상이어야 합니다.") BigDecimal safetyStock,
            /**
             * 원본 품목등록 리스트의 [구매처명] — 이 품목을 늘 사 오는 곳 (선택).
             * inventory 가 trade 를 참조할 수 없어 id 만 든다. 이름은 화면이 붙인다.
             */
            Long supplierId,
            /**
             * 원본 품목등록 리스트의 [이미지] — 품목 사진 파일 id (선택).
             * 파일은 POST /api/files 로 먼저 올린다(기안서 첨부와 같은 흐름).
             */
            Long imageFileId,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String barcode,
            /** 원본 품목등록 리스트의 [검색창내용]. 부르는 이름으로 찾게 한다. */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String searchKeyword,
            /**
             * 재고수량관리 — 원본 품목등록 리스트의 열('수량관리대상' · '수량관리제외').
             * 안 주면 <b>관리대상</b>이다. 모르고 껐다가 재고가 조용히 안 움직이는 것보다
             * 켜 두고 필요할 때 끄는 쪽이 안전하다.
             */
            Boolean stockTracked,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
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
            /** 원본 품목등록 리스트의 [이미지]. 파일이 없으면 둘 다 null. */
            Long imageFileId, String imageFileName,
            /** 원본 품목등록 리스트의 [구매처명]. 이름은 화면이 거래처 목록에서 붙인다. */
            Long supplierId,
            String barcode,
            /** 원본 품목등록 리스트의 [검색창내용]. */
            String searchKeyword,
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
                    item.getImageFile() != null ? item.getImageFile().getId() : null,
                    item.getImageFile() != null ? item.getImageFile().getName() : null,
                    item.getSupplierId(),
                    item.getBarcode(),
                    item.getSearchKeyword(),
                    item.isStockTracked(),
                    item.getUdiDi(),
                    item.getManagementItem() == null ? null : item.getManagementItem().getId(),
                    item.getManagementItem() == null ? null : item.getManagementItem().getName(),
                    item.isActive()
            );
        }
    }
}
