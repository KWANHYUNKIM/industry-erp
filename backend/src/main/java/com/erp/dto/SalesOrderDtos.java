package com.erp.dto;

import com.erp.domain.SalesOrder;
import com.erp.domain.SalesOrderLine;
import com.erp.domain.SalesOrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class SalesOrderDtos {

    private SalesOrderDtos() {}

    public record OrderLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice
    ) {}

    public record CreateSalesOrderRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            LocalDate orderDate,
            LocalDate dueDate,
            Boolean taxable,
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<OrderLineRequest> lines
    ) {}

    public record UpdateStatusRequest(
            @NotNull SalesOrderStatus status
    ) {}

    public record OrderLineResponse(
            Long lineId, Long itemId, String itemCode, String itemName, String unit,
            BigDecimal quantity, BigDecimal shippedQty, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount
    ) {
        static OrderLineResponse from(SalesOrderLine l) {
            return new OrderLineResponse(
                    l.getId(), l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getQuantity(), l.getShippedQty(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount());
        }
    }

    /** 미출하현황: 주문 라인 단위 (주문수량 대비 실제 누적출하 기준 미출하 잔량) */
    public record UnshippedLineResponse(
            Long orderId, String orderNo, Long orderLineId,
            Long partnerId, String partnerName,
            LocalDate orderDate, LocalDate dueDate,
            SalesOrderStatus status, String statusName,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal orderQty, BigDecimal shippedQty, BigDecimal unshippedQty
    ) {
        public static UnshippedLineResponse of(SalesOrder o, SalesOrderLine l) {
            BigDecimal orderQty = l.getQuantity();
            BigDecimal shipped = l.getShippedQty() != null ? l.getShippedQty() : BigDecimal.ZERO;
            return new UnshippedLineResponse(
                    o.getId(), o.getOrderNo(), l.getId(),
                    o.getPartner().getId(), o.getPartner().getName(),
                    o.getOrderDate(), o.getDueDate(),
                    o.getStatus(), o.getStatus().getDisplayName(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    orderQty, shipped, orderQty.subtract(shipped));
        }
    }

    /** 출하처리 요청: 주문 라인별 출하수량. lines 비우면 전 라인 잔량 전체출하. */
    public record ShipLineRequest(
            @NotNull(message = "주문라인을 지정하세요.") Long orderLineId,
            @NotNull @Positive(message = "출하수량은 0보다 커야 합니다.") BigDecimal qty
    ) {}

    public record ShipRequest(
            @Valid List<ShipLineRequest> lines
    ) {}

    public record SalesOrderResponse(
            Long id, String orderNo,
            Long partnerId, String partnerName,
            LocalDate orderDate, LocalDate dueDate,
            SalesOrderStatus status, String statusName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String remark, String createdBy,
            List<OrderLineResponse> lines
    ) {
        public static SalesOrderResponse from(SalesOrder o) {
            return new SalesOrderResponse(
                    o.getId(), o.getOrderNo(),
                    o.getPartner().getId(), o.getPartner().getName(),
                    o.getOrderDate(), o.getDueDate(),
                    o.getStatus(), o.getStatus().getDisplayName(),
                    o.getSupplyAmount(), o.getVatAmount(), o.getTotalAmount(),
                    o.getRemark(), o.getCreatedBy(),
                    o.getLines().stream().map(OrderLineResponse::from).toList());
        }
    }
}
