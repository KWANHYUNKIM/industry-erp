package com.erp.trade.dto;

import com.erp.trade.domain.MallOrder;
import com.erp.trade.domain.enums.MallOrderStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public class MallOrderDtos {

    /** 외부몰 주문 수집. 실제 몰 API 연동이 붙기 전까지 이 엔드포인트가 그 자리다. */
    public record CollectOrderRequest(
            @NotBlank(message = "몰 이름을 입력하세요.") String mall,
            @NotBlank(message = "몰 주문번호를 입력하세요.") String mallOrderNo,
            @NotNull(message = "주문일을 입력하세요.") LocalDate orderDate,
            @NotBlank(message = "구매자명을 입력하세요.") String buyerName,
            String buyerPhone,
            String address,
            @NotBlank(message = "상품명을 입력하세요.") String productName,
            Long itemId,
            @NotNull(message = "수량을 입력하세요.") BigDecimal quantity,
            @NotNull(message = "단가를 입력하세요.") BigDecimal unitPrice,
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
            Long itemId,
            String itemCode,
            String itemName,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal totalAmount,
            Long salesId,
            String salesDocNo,
            String remark,
            String createdBy
    ) {
        public static MallOrderResponse from(MallOrder o) {
            return new MallOrderResponse(
                    o.getId(), o.getMall(), o.getMallOrderNo(), o.getOrderDate(),
                    o.getStatus(), o.getStatus().getDisplayName(),
                    o.getBuyerName(), o.getBuyerPhone(), o.getAddress(),
                    o.getProductName(),
                    o.getItem() != null ? o.getItem().getId() : null,
                    o.getItem() != null ? o.getItem().getCode() : null,
                    o.getItem() != null ? o.getItem().getName() : null,
                    o.getQuantity(), o.getUnitPrice(), o.getTotalAmount(),
                    o.getSales() != null ? o.getSales().getId() : null,
                    o.getSales() != null ? o.getSales().getDocNo() : null,
                    o.getRemark(), o.getCreatedBy());
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
