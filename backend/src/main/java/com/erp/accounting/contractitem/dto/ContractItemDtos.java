package com.erp.accounting.contractitem.dto;

import com.erp.accounting.contractitem.BillingCycle;
import com.erp.accounting.contractitem.ContractItem;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public final class ContractItemDtos {
    private ContractItemDtos() {}

    public record SaveContractItemRequest(
            @NotBlank(message = "계약항목코드를 입력하세요.") @Size(max = 5, message = "계약항목코드는 5자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "계약항목명을 입력하세요.") @Size(max = 100) String name,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            boolean vatIncluded,
            @NotNull BillingCycle billingCycle,
            Long salesAccountId,
            /** [품목별단가 › 설정] 품목연결설정. null 이면 그대로 둔다. */
            java.util.List<@jakarta.validation.Valid ProductLink> products,
            /** [수량별단가 › 설정]. null 이면 그대로 둔다. */
            java.util.List<@jakarta.validation.Valid QtyPrice> qtyPrices
    ) {}

    /** 수량별단가 한 줄 — 수량 minQuantity 이상이면 unitPrice(원본 [설정] 창 미실측). */
    public record QtyPrice(
            @NotNull(message = "수량을 입력하세요.") @PositiveOrZero(message = "수량은 0 이상이어야 합니다.") BigDecimal minQuantity,
            @NotNull(message = "단가를 입력하세요.") @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            boolean vatIncluded
    ) {}

    /**
     * 품목연결설정 한 줄 — 계약항목등록 [품목별단가 › 설정] · 계약입력 줄 [상세] 창이 같이 쓴다.
     * 공급가액 · 부가세를 비우면 서버가 수량 × 단가 · 공급가액의 10%(원 미만 버림)로 셈한다.
     */
    public record ProductLink(
            @NotNull(message = "품목코드를 입력하세요.") Long itemId,
            String itemCode,
            String itemName,
            String spec,
            @NotNull(message = "수량을 입력하세요.") BigDecimal quantity,
            @NotNull(message = "단가를 입력하세요.") BigDecimal unitPrice,
            BigDecimal supplyAmount,
            BigDecimal vatAmount
    ) {
        public static ProductLink of(com.erp.inventory.item.Item i, BigDecimal quantity, BigDecimal unitPrice, BigDecimal supply, BigDecimal vat) {
            return new ProductLink(i.getId(), i.getCode(), i.getName(), i.getSpec(), quantity, unitPrice, supply, vat);
        }

        public BigDecimal supplyOrDefault() {
            return supplyAmount != null ? supplyAmount : quantity.multiply(unitPrice).setScale(0, java.math.RoundingMode.HALF_UP);
        }

        public BigDecimal vatOrDefault() {
            return vatAmount != null ? vatAmount : supplyOrDefault().multiply(BigDecimal.valueOf(0.1)).setScale(0, java.math.RoundingMode.DOWN);
        }
    }

    /** 원본 [사용중단/재사용] — 고른 항목을 한 번에. */
    public record ActiveRequest(java.util.List<Long> ids, boolean active) {}

    public record ContractItemResponse(
            Long id, String code, String name, BigDecimal unitPrice, boolean vatIncluded,
            BillingCycle billingCycle, String billingCycleName,
            Long salesAccountId, String salesAccountCode, String salesAccountName, boolean active,
            /** 목록 [품목별단가] — 품목연결설정 공급가액 합계(없으면 null). */
            BigDecimal productPrice,
            java.util.List<ProductLink> products,
            /** 목록 [수량별단가] — 첫 줄(가장 작은 수량)의 단가(없으면 null). */
            BigDecimal qtyPrice,
            java.util.List<QtyPrice> qtyPrices
    ) {
        public static ContractItemResponse from(ContractItem i) {
            java.util.List<ProductLink> ps = i.getProducts().stream()
                    .map((p) -> ProductLink.of(p.getItem(), p.getQuantity(), p.getUnitPrice(), p.getSupplyAmount(), p.getVatAmount())).toList();
            return new ContractItemResponse(i.getId(), i.getCode(), i.getName(), i.getUnitPrice(), i.isVatIncluded(),
                    i.getBillingCycle(), i.getBillingCycle().getDisplayName(),
                    i.getSalesAccount() != null ? i.getSalesAccount().getId() : null,
                    i.getSalesAccount() != null ? i.getSalesAccount().getCode() : null,
                    i.getSalesAccount() != null ? i.getSalesAccount().getName() : null,
                    i.isActive(),
                    ps.isEmpty() ? null : ps.stream().map(ProductLink::supplyAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                    ps,
                    i.getQtyPrices().isEmpty() ? null : i.getQtyPrices().get(0).getUnitPrice(),
                    i.getQtyPrices().stream().map((q) -> new QtyPrice(q.getMinQuantity(), q.getUnitPrice(), q.isVatIncluded())).toList());
        }
    }
}
