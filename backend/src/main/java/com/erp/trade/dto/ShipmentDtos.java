package com.erp.trade.dto;

import com.erp.trade.domain.SalesOrder;
import com.erp.trade.domain.Shipment;
import com.erp.trade.domain.ShipmentLine;
import com.erp.trade.domain.ShipmentStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ShipmentDtos {

    private ShipmentDtos() {}

    public record ShipLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            BigDecimal unitPrice
    ) {}

    public record CreateShipmentRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            LocalDate shipDate,
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<ShipLineRequest> lines
    ) {}

    public record UpdateStatusRequest(
            @NotNull ShipmentStatus status
    ) {}

    public record ShipLineResponse(
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal amount,
            /** 근거 주문 라인. 직접 등록한 출하면 null. */
            Long orderLineId
    ) {
        static ShipLineResponse from(ShipmentLine l) {
            return new ShipLineResponse(
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getQuantity(), l.getUnitPrice(), l.getAmount(),
                    l.getOrderLine() != null ? l.getOrderLine().getId() : null);
        }
    }

    public record ShipmentResponse(
            Long id, String shipNo,
            Long partnerId, String partnerName,
            /** 근거 주문. 직접 등록한 출하면 null. */
            Long salesOrderId, String salesOrderNo,
            LocalDate shipDate,
            ShipmentStatus status, String statusName,
            BigDecimal totalQuantity, BigDecimal totalAmount,
            String remark, String createdBy,
            List<ShipLineResponse> lines
    ) {
        public static ShipmentResponse from(Shipment s) {
            SalesOrder order = s.getSalesOrder();
            return new ShipmentResponse(
                    s.getId(), s.getShipNo(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    order != null ? order.getId() : null,
                    order != null ? order.getOrderNo() : null,
                    s.getShipDate(),
                    s.getStatus(), s.getStatus().getDisplayName(),
                    s.getTotalQuantity(), s.getTotalAmount(),
                    s.getRemark(), s.getCreatedBy(),
                    s.getLines().stream().map(ShipLineResponse::from).toList());
        }
    }
}
