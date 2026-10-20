package com.erp.trade.shipmentorder.dto;

import com.erp.trade.shipmentorder.ShipmentOrder;
import com.erp.trade.shipmentorder.ShipmentOrderLine;
import com.erp.trade.shipmentorder.ShipmentOrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class ShipmentOrderDtos {

    private ShipmentOrderDtos() {}

    public record LineRequest(
            /** 고칠 때 기존 줄 id — 이어진 출하가 그 줄을 계속 가리키게 한다. 새 줄이면 null. */
            Long id,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @Size(max = 255, message = "입력한 글자가 너무 깁니다. 255자까지 넣을 수 있습니다.") String remark
    ) {}

    /** 출하지시서 저장 — 원본 머리 칸 차례: 일자 · 거래처 · 담당자 · 출하창고 · 프로젝트 · 연락처 · 출하예정일 · 우편번호 · 주소. */
    public record SaveRequest(
            LocalDate orderDate,
            Long partnerId,
            Long employeeId,
            Long warehouseId,
            Long projectId,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String contact,
            LocalDate dueDate,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String postalCode,
            @Size(max = 255, message = "입력한 글자가 너무 깁니다. 255자까지 넣을 수 있습니다.") String address,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.") String remark,
            @Valid List<LineRequest> lines
    ) {}

    public record StatusRequest(@NotNull(message = "진행상태를 선택하세요.") ShipmentOrderStatus status) {}

    public record ShipLine(@NotNull Long lineId,
                           @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity) {}

    /** 출하지시서에 이어 출하 — 원본 출하입력 [출하지시] › 잔량적용. 줄을 안 주면 남은 잔량 전부. */
    public record ShipRequest(LocalDate shipDate, @Valid List<ShipLine> lines) {}

    public record LineResponse(
            Long id, Long itemId, String itemCode, String itemName, String spec, String unit,
            BigDecimal quantity, BigDecimal shippedQty, BigDecimal unshippedQty, String remark
    ) {
        static LineResponse from(ShipmentOrderLine l, Map<Long, BigDecimal> shipped) {
            BigDecimal s = shipped.getOrDefault(l.getId(), BigDecimal.ZERO);
            return new LineResponse(l.getId(), l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(),
                    l.getItem().getSpec(), l.getItem().getUnit(), l.getQuantity(), s,
                    l.getQuantity().subtract(s), l.getRemark());
        }
    }

    public record ShipmentOrderResponse(
            Long id, String orderNo, LocalDate orderDate,
            Long partnerId, String partnerCode, String partnerName,
            Long employeeId, String employeeName,
            Long warehouseId, String warehouseName,
            Long projectId, String projectName,
            String contact, LocalDate dueDate, String postalCode, String address, String remark,
            ShipmentOrderStatus status, String statusName,
            BigDecimal totalQuantity, String createdBy,
            LocalDateTime createdAt, LocalDateTime updatedAt,
            List<LineResponse> lines
    ) {
        public static ShipmentOrderResponse from(ShipmentOrder o, Map<Long, BigDecimal> shipped) {
            return new ShipmentOrderResponse(o.getId(), o.getOrderNo(), o.getOrderDate(),
                    o.getPartner().getId(), o.getPartner().getCode(), o.getPartner().getName(),
                    o.getEmployee() != null ? o.getEmployee().getId() : null,
                    o.getEmployee() != null ? o.getEmployee().getName() : null,
                    o.getWarehouse() != null ? o.getWarehouse().getId() : null,
                    o.getWarehouse() != null ? o.getWarehouse().getName() : null,
                    o.getProject() != null ? o.getProject().getId() : null,
                    o.getProject() != null ? o.getProject().getName() : null,
                    o.getContact(), o.getDueDate(), o.getPostalCode(), o.getAddress(), o.getRemark(),
                    o.getStatus(), o.getStatus().getDisplayName(),
                    o.getTotalQuantity(), o.getCreatedBy(), o.getCreatedAt(), o.getUpdatedAt(),
                    o.getLines().stream().map(l -> LineResponse.from(l, shipped)).toList());
        }
    }

    /** 미출하현황(원본 E040228) 한 줄 — 일자-No. · 품목명(규격) · 수량 · 미출하수량 · 창고명 · 거래처명 · 출하예정일. */
    public record UnshippedLine(
            Long shipmentOrderId, String orderNo, LocalDate orderDate, Long lineId,
            Long itemId, String itemCode, String itemName, String spec,
            BigDecimal quantity, BigDecimal unshippedQty,
            Long warehouseId, String warehouseName, Long partnerId, String partnerName,
            LocalDate dueDate, String remark
    ) {}
}
