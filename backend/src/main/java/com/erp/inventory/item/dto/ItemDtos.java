package com.erp.inventory.item.dto;

import com.erp.inventory.item.Item;
import com.erp.inventory.item.ItemCategory;
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
            @Size(max = 200, message = "품목명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "품목명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String spec,
            /** 단위 (선택). 원본 품목등록은 단위가 비어도 저장한다 — 빈 칸 표시는 품목명에만 붙는다(C000029 실측). */
            @Size(max = 20, message = "단위는 20자까지 넣을 수 있습니다.")
            String unit,
            @NotNull(message = "품목구분을 선택하세요.") ItemCategory category,
            @NotNull(message = "단가를 입력하세요.") @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            /** 구매(입고) 기준단가. 안 주면 0 — "구매 기준단가를 안 정했다" 는 뜻이다. */
            @PositiveOrZero(message = "구매단가는 0 이상이어야 합니다.") BigDecimal purchasePrice,
            /** 단가A ~ 단가J (원본 품목등록 [단가] 탭). 차례대로 열 칸. 안 주면 수정 때는 그대로 둔다. */
            @Size(max = 10, message = "단가는 A ~ J 열 칸입니다.")
            java.util.List<@PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal> gradePrices,
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
            Long itemGroupId,
            /*
             * 원본 품목등록 폼의 나머지 칸들 — 담을 데가 없어 화면에 그리지도 못하던 것이다.
             * 참/거짓은 Boolean 으로 받는다: 안 보내면 <b>기본값</b>을 쓴다는 뜻이고,
             * false 와 "안 보냄" 을 가려야 나중에 부분 수정이 가능하다.
             */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            @PositiveOrZero(message = "부가세율은 0 이상이어야 합니다.") BigDecimal vatRateSales,
            @PositiveOrZero(message = "부가세율은 0 이상이어야 합니다.") BigDecimal vatRatePurchase,
            @PositiveOrZero(message = "외주비단가는 0 이상이어야 합니다.") BigDecimal subcontractPrice,
            @PositiveOrZero(message = "조달기간은 0 이상이어야 합니다.") Integer leadTimeDays,
            @PositiveOrZero(message = "최소구매단위는 0 이상이어야 합니다.") BigDecimal minPurchaseUnit,
            Boolean setItem,
            Boolean sharedItem,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String itemType,
            /** 원본 [대표품목]. 규격만 다른 형제 품목들의 대표 (선택). */
            Long parentItemId,
            Boolean lotManaged,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String qcType,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String qcMethod,
            Boolean qcOnPurchase,
            Boolean qcOnProduction,
            Boolean autoProductionOnSales,
            Boolean autoProductionOnTransfer,
            /*
             * [원가] 탭(원본 C000029). 화면은 세 칸을 늘 같이 보낸다(재료비표준원가 빈칸 = null). 표준노무시간을
             * 안 보내면 세 칸을 그대로 둔다 — 원가 탭을 모르는 호출이 값을 지우지 않게(ItemService.applyCost).
             * 원본은 음수도 말 없이 저장한다(2026-10-20 실측).
             */
            BigDecimal stdLaborHours,
            BigDecimal expenseWeight,
            BigDecimal materialStdCost
    ) {}

    public record UpdateItemRequest(
            @Size(max = 200, message = "품목명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "품목명을 입력하세요.") String name,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String spec,
            /** 단위 (선택). 원본 품목등록은 단위가 비어도 저장한다 — 빈 칸 표시는 품목명에만 붙는다(C000029 실측). */
            @Size(max = 20, message = "단위는 20자까지 넣을 수 있습니다.")
            String unit,
            @NotNull(message = "품목구분을 선택하세요.") ItemCategory category,
            @NotNull(message = "단가를 입력하세요.")
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            /** 구매(입고) 기준단가. 안 주면 0 — "구매 기준단가를 안 정했다" 는 뜻이다. */
            @PositiveOrZero(message = "구매단가는 0 이상이어야 합니다.") BigDecimal purchasePrice,
            /** 단가A ~ 단가J (원본 품목등록 [단가] 탭). 차례대로 열 칸. 안 주면 수정 때는 그대로 둔다. */
            @Size(max = 10, message = "단가는 A ~ J 열 칸입니다.")
            java.util.List<@PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal> gradePrices,
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
            /*
             * 원본 품목등록 폼의 나머지 칸들 — 담을 데가 없어 화면에 그리지도 못하던 것이다.
             * 참/거짓은 Boolean 으로 받는다: 안 보내면 <b>기본값</b>을 쓴다는 뜻이고,
             * false 와 "안 보냄" 을 가려야 나중에 부분 수정이 가능하다.
             */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark,
            @PositiveOrZero(message = "부가세율은 0 이상이어야 합니다.") BigDecimal vatRateSales,
            @PositiveOrZero(message = "부가세율은 0 이상이어야 합니다.") BigDecimal vatRatePurchase,
            @PositiveOrZero(message = "외주비단가는 0 이상이어야 합니다.") BigDecimal subcontractPrice,
            @PositiveOrZero(message = "조달기간은 0 이상이어야 합니다.") Integer leadTimeDays,
            @PositiveOrZero(message = "최소구매단위는 0 이상이어야 합니다.") BigDecimal minPurchaseUnit,
            Boolean setItem,
            Boolean sharedItem,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String itemType,
            /** 원본 [대표품목]. 규격만 다른 형제 품목들의 대표 (선택). */
            Long parentItemId,
            Boolean lotManaged,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String qcType,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String qcMethod,
            Boolean qcOnPurchase,
            Boolean qcOnProduction,
            Boolean autoProductionOnSales,
            Boolean autoProductionOnTransfer,
            /*
             * [원가] 탭(원본 C000029). 화면은 세 칸을 늘 같이 보낸다(재료비표준원가 빈칸 = null). 표준노무시간을
             * 안 보내면 세 칸을 그대로 둔다 — 원가 탭을 모르는 호출이 값을 지우지 않게(ItemService.applyCost).
             * 원본은 음수도 말 없이 저장한다(2026-10-20 실측).
             */
            BigDecimal stdLaborHours,
            BigDecimal expenseWeight,
            BigDecimal materialStdCost,
            Boolean active
    ) {}

    /** 품목별단가에서 단가만 고칠 때. 안 준 칸은 그대로 둔다. */
    public record UpdateItemPricesRequest(
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            @PositiveOrZero(message = "구매단가는 0 이상이어야 합니다.") BigDecimal purchasePrice,
            @Size(max = 10, message = "단가는 A ~ J 열 칸입니다.")
            java.util.List<@PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal> gradePrices
    ) {}

    /** 리스트 [삭제] — 체크한 품목들. */
    public record DeleteItemsRequest(
            @jakarta.validation.constraints.NotEmpty(message = "리스트에 선택된 자료가 없습니다.") java.util.List<Long> ids
    ) {}

    /**
     * 원본 '삭제불가코드' 창의 한 줄(코드 · 코드명 · 자료). 지워진 품목은 여기 없다.
     * deleted 는 함께 고른 것 중 실제로 지운 수.
     */
    public record UndeletableItem(Long id, String code, String name, String data) {}

    public record DeleteItemsResponse(int deleted, java.util.List<UndeletableItem> undeletable) {}

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
            /** 단가A ~ 단가J. 늘 열 칸. */
            java.util.List<BigDecimal> gradePrices,
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
            boolean active,
            /* 원본 품목등록 폼의 나머지 칸들. */
            String remark,
            BigDecimal vatRateSales, BigDecimal vatRatePurchase,
            BigDecimal subcontractPrice, Integer leadTimeDays, BigDecimal minPurchaseUnit,
            boolean setItem, boolean sharedItem, String itemType,
            /** 대표품목은 id 와 <b>이름</b>을 같이 준다 — 화면이 목록을 다시 뒤지지 않게. */
            Long parentItemId, String parentItemName,
            boolean lotManaged, String qcType, String qcMethod,
            boolean qcOnPurchase, boolean qcOnProduction,
            boolean autoProductionOnSales, boolean autoProductionOnTransfer,
            /** [원가] 탭. 경비 · 노무비 · 외주비표준원가는 원본 창에서 잠긴 칸이라 보기만 한다. */
            BigDecimal stdLaborHours, BigDecimal expenseWeight, BigDecimal materialStdCost,
            BigDecimal expenseStdCost, BigDecimal laborStdCost, BigDecimal subcontractStdCost,
            /** 원본 조건 [최초작성일자]·[최종수정일자]. BaseTimeEntity 가 진작 들고 있다. */
            java.time.LocalDate createdDate, java.time.LocalDate updatedDate
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
                    item.getGradePrices(),
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
                    item.isActive(),
                    item.getRemark(),
                    item.getVatRateSales(), item.getVatRatePurchase(),
                    item.getSubcontractPrice(), item.getLeadTimeDays(), item.getMinPurchaseUnit(),
                    item.isSetItem(), item.isSharedItem(), item.getItemType(),
                    item.getParentItem() != null ? item.getParentItem().getId() : null,
                    item.getParentItem() != null ? item.getParentItem().getName() : null,
                    item.isLotManaged(), item.getQcType(), item.getQcMethod(),
                    item.isQcOnPurchase(), item.isQcOnProduction(),
                    item.isAutoProductionOnSales(), item.isAutoProductionOnTransfer(),
                    item.getStdLaborHours(), item.getExpenseWeight(), item.getMaterialStdCost(),
                    item.getExpenseStdCost(), item.getLaborStdCost(), item.getSubcontractStdCost(),
                    item.getCreatedAt() != null ? item.getCreatedAt().toLocalDate() : null,
                    item.getUpdatedAt() != null ? item.getUpdatedAt().toLocalDate() : null
            );
        }
    }
}
