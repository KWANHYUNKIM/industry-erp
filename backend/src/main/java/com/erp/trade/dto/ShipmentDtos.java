package com.erp.trade.dto;

import com.erp.trade.domain.SalesOrder;
import com.erp.trade.domain.Shipment;
import com.erp.trade.domain.ShipmentLine;
import com.erp.trade.domain.ShipmentStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
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
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.")
            BigDecimal unitPrice,
            /** 줄 적요. 원본 출하지시서입력 그리드의 마지막 열. */
            @Size(max = 255, message = "비고는 255자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record CreateShipmentRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            LocalDate shipDate,
            /** 출하예정일. 미출하현황이 이 값으로 거른다. */
            LocalDate dueDate,
            Long warehouseId,
            Long employeeId,
            /** 배송지 — 거래처 주소와 다른 곳으로 보낼 수 있다. */
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String contact,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.")
            String postalCode,
            @Size(max = 255, message = "입력한 글자가 너무 깁니다. 255자까지 넣을 수 있습니다.")
            String address,
            /** 귀속 프로젝트. 원본 출하현황 조건의 [프로젝트]. 안 정할 수 있다. */
            Long projectId,
            @Size(max = 500, message = "비고는 500자까지 넣을 수 있습니다.")
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<ShipLineRequest> lines
    ) {}

    public record UpdateStatusRequest(
            @NotNull(message = "출하상태를 선택하세요.") ShipmentStatus status
    ) {}

    public record ShipLineResponse(
            Long itemId, String itemCode, String itemName, String unit,
            /** 규격. 원본 출하지시서현황·출하현황의 결과 열이 [품목명(규격)] 이다. */
            String spec,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal amount,
            /** 줄 적요. 원본 출하현황·출하지시서현황의 결과 열. */
            String remark,
            /** 근거 주문 라인. 직접 등록한 출하면 null. */
            Long orderLineId
    ) {
        static ShipLineResponse from(ShipmentLine l) {
            return new ShipLineResponse(
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(),
                    l.getItem().getUnit(), l.getItem().getSpec(),
                    l.getQuantity(), l.getUnitPrice(), l.getAmount(), l.getRemark(),
                    l.getOrderLine() != null ? l.getOrderLine().getId() : null);
        }
    }

    public record ShipmentResponse(
            Long id, String shipNo,
            Long partnerId, String partnerName,
            /** 근거 주문. 직접 등록한 출하면 null. */
            Long salesOrderId, String salesOrderNo,
            LocalDate shipDate,
            /** 출하예정일 · 출하창고 · 담당자 · 배송지. 원본 출하지시서입력의 머리 항목들이다. */
            LocalDate dueDate,
            Long warehouseId, String warehouseName,
            Long employeeId, String employeeName,
            String contact, String postalCode, String address,
            ShipmentStatus status, String statusName,
            BigDecimal totalQuantity, BigDecimal totalAmount,
            /** 귀속 프로젝트. 원본 출하현황 조건의 [프로젝트]. */
            Long projectId, String projectName,
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
                    s.getDueDate(),
                    s.getWarehouse() != null ? s.getWarehouse().getId() : null,
                    s.getWarehouse() != null ? s.getWarehouse().getName() : null,
                    s.getEmployee() != null ? s.getEmployee().getId() : null,
                    s.getEmployee() != null ? s.getEmployee().getName() : null,
                    s.getContact(), s.getPostalCode(), s.getAddress(),
                    s.getStatus(), s.getStatus().getDisplayName(),
                    s.getTotalQuantity(), s.getTotalAmount(),
                    s.getProject() != null ? s.getProject().getId() : null,
                    s.getProject() != null ? s.getProject().getName() : null,
                    s.getRemark(), s.getCreatedBy(),
                    s.getLines().stream().map(ShipLineResponse::from).toList());
        }
    }
}
