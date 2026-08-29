package com.erp.trade.dto;

import com.erp.trade.domain.MallOrder;
import com.erp.trade.domain.enums.MallOrderStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class MallOrderDtos {

    /** 외부몰 주문 수집. 실제 몰 API 연동이 붙기 전까지 이 엔드포인트가 그 자리다. */
    public record CollectOrderRequest(
            @Size(max = 50, message = "몰 이름은 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "몰 이름을 입력하세요.") String mall,
            @Size(max = 50, message = "몰 주문번호는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "몰 주문번호를 입력하세요.") String mallOrderNo,
            @NotNull(message = "주문일을 입력하세요.") LocalDate orderDate,
            @Size(max = 100, message = "구매자명은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "구매자명을 입력하세요.") String buyerName,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String buyerPhone,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String address,
            @Size(max = 200, message = "상품명은 200자까지 넣을 수 있습니다.")
            @NotBlank(message = "상품명을 입력하세요.") String productName,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String mallProductCode,
            Long itemId,
            @Positive(message = "수량은 0보다 커야 합니다.")
            @NotNull(message = "수량을 입력하세요.") BigDecimal quantity,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.")
            @NotNull(message = "단가를 입력하세요.") BigDecimal unitPrice,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark
    ) {}

    /** 몰 상품 ↔ 우리 품목 매핑 */
    public record MapItemRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId
    ) {}

    /** 판매전환. 어느 거래처(몰)·창고로 팔린 것으로 잡을지 정한다. */
    public record ConvertRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            Boolean taxable
    ) {}

    /** 배송처리: 택배사·송장번호 입력. 배송일 미입력 시 오늘. */
    public record ShipRequest(
            @Size(max = 50, message = "택배사는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "택배사를 입력하세요.") String courier,
            @Size(max = 50, message = "송장번호는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "송장번호를 입력하세요.") String trackingNo,
            LocalDate shippedAt
    ) {}

    /** 반품/교환 처리: 사유. 교환은 재발송 택배정보(선택). */
    public record CloseRequest(
            @NotBlank(message = "사유를 입력하세요.") String reason,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String courier,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String trackingNo,
            LocalDate closedAt
    ) {}

    public record MallOrderResponse(
            Long id,
            String mall,
            String mallOrderNo,
            LocalDate orderDate,
            MallOrderStatus status,
            String statusName,
            String buyerName,
            String buyerPhone,
            String address,
            String productName,
            String mallProductCode,
            Long itemId,
            String itemCode,
            String itemName,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal totalAmount,
            Long salesId,
            String salesDocNo,
            String remark,
            String createdBy,
            String courier,
            String trackingNo,
            LocalDate shippedAt,
            String closeReason,
            LocalDate closedAt
    ) {
        public static MallOrderResponse from(MallOrder o) {
            return new MallOrderResponse(
                    o.getId(), o.getMall(), o.getMallOrderNo(), o.getOrderDate(),
                    o.getStatus(), o.getStatus().getDisplayName(),
                    o.getBuyerName(), o.getBuyerPhone(), o.getAddress(),
                    o.getProductName(), o.getMallProductCode(),
                    o.getItem() != null ? o.getItem().getId() : null,
                    o.getItem() != null ? o.getItem().getCode() : null,
                    o.getItem() != null ? o.getItem().getName() : null,
                    o.getQuantity(), o.getUnitPrice(), o.getTotalAmount(),
                    o.getSales() != null ? o.getSales().getId() : null,
                    o.getSales() != null ? o.getSales().getDocNo() : null,
                    o.getRemark(), o.getCreatedBy(),
                    o.getCourier(), o.getTrackingNo(), o.getShippedAt(),
                    o.getCloseReason(), o.getClosedAt());
        }
    }

    /** 몰별 집계 */
    public record MallSummary(
            String mall,
            int orderCount,
            BigDecimal totalAmount,
            int unconverted
    ) {}

    public record MallOverview(
            int totalOrders,
            BigDecimal totalAmount,
            int unmapped,
            int unconverted,
            List<MallSummary> byMall,
            List<MallOrderResponse> orders
    ) {}
}
