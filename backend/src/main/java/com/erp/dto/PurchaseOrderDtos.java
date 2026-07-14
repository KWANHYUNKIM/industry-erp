package com.erp.dto;

import com.erp.domain.PurchaseOrder;
import com.erp.domain.PurchaseOrderLine;
import com.erp.domain.PurchaseOrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class PurchaseOrderDtos {

    private PurchaseOrderDtos() {}

    /** 발주요청 라인. 단가는 이 시점에 모를 수 있어 선택값이다(미입력 시 품목 기준단가). */
    public record OrderLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice
    ) {}

    public record CreatePurchaseOrderRequest(
            @NotNull(message = "매입처를 선택하세요.") Long partnerId,
            LocalDate orderDate,
            LocalDate dueDate,
            Boolean taxable,
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<OrderLineRequest> lines
    ) {}

    /** 발주계획: 납기일 확정 */
    public record PlanRequest(LocalDate dueDate) {}

    /** 단가요청 결과 반영: 매입처가 회신한 단가를 라인별로 확정한다. */
    public record LinePriceRequest(
            @NotNull(message = "라인을 지정하세요.") Long lineId,
            @NotNull @Positive(message = "단가는 0보다 커야 합니다.") BigDecimal unitPrice
    ) {}

    public record ApplyPricesRequest(
            @NotEmpty(message = "단가를 1개 이상 입력하세요.") @Valid List<LinePriceRequest> lines
    ) {}

    /** 입고 전환: 어느 창고로 받을지 지정해야 구매전표를 만들 수 있다. */
    public record ReceiveRequest(
            @NotNull(message = "입고 창고를 선택하세요.") Long warehouseId,
            LocalDate purchaseDate
    ) {}

    public record OrderLineResponse(
            Long id, int lineNo,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount
    ) {
        public static OrderLineResponse from(PurchaseOrderLine l) {
            return new OrderLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount());
        }
    }

    public record PurchaseOrderResponse(
            Long id, String orderNo, LocalDate orderDate, LocalDate dueDate,
            Long partnerId, String partnerName,
            PurchaseOrderStatus status, String statusName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            Boolean taxable, Long convertedPurchaseId, String remark, String createdBy,
            List<OrderLineResponse> lines
    ) {
        public static PurchaseOrderResponse from(PurchaseOrder po) {
            return new PurchaseOrderResponse(
                    po.getId(), po.getOrderNo(), po.getOrderDate(), po.getDueDate(),
                    po.getPartner().getId(), po.getPartner().getName(),
                    po.getStatus(), po.getStatus().getDisplayName(),
                    po.getSupplyAmount(), po.getVatAmount(), po.getTotalAmount(),
                    po.getTaxable(), po.getConvertedPurchaseId(), po.getRemark(), po.getCreatedBy(),
                    po.getLines().stream().map(OrderLineResponse::from).toList());
        }
    }
}
