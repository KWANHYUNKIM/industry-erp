package com.erp.trade.dto;

import com.erp.trade.domain.PurchaseOrder;
import com.erp.trade.domain.PurchaseOrderLine;
import com.erp.trade.domain.PurchaseOrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
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
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            /** 라인 거래처(선택). 미지정 시 헤더 매입처 기준. */
            Long partnerId,
            @Size(max = 200, message = "비고는 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record CreatePurchaseOrderRequest(
            @NotNull(message = "매입처를 선택하세요.") Long partnerId,
            LocalDate orderDate,
            LocalDate dueDate,
            /** 원본 단가요청진행단계의 [유효기간] — 회신받은 단가가 언제까지 유효한가. */
            LocalDate priceValidUntil,
            Boolean taxable,
            @Size(max = 500, message = "비고는 500자까지 넣을 수 있습니다.")
            String remark,
            Long employeeId,
            Long warehouseId,
            /* 원본 발주서의 [프로젝트]. 발주 시점에는 안 정했을 수 있어 필수가 아니다. */
            Long projectId,
            String currency,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<OrderLineRequest> lines
    ) {}

    /** 발주계획: 납기일 확정 */
    public record PlanRequest(LocalDate dueDate) {}

    /** 단가요청 결과 반영: 매입처가 회신한 단가를 라인별로 확정한다. */
    public record LinePriceRequest(
            @NotNull(message = "라인을 지정하세요.") Long lineId,
            @NotNull(message = "단가를 입력하세요.") @Positive(message = "단가는 0보다 커야 합니다.") BigDecimal unitPrice
    ) {}

    public record ApplyPricesRequest(
            @NotEmpty(message = "단가를 1개 이상 입력하세요.") @Valid List<LinePriceRequest> lines,
            /**
             * 회신받은 단가의 [유효기간]. 매입처는 값과 함께 <b>언제까지 유효한지</b>를 준다.
             * 안 주면 그대로 둔다(등록할 때 적어 뒀을 수 있다).
             */
            LocalDate priceValidUntil
    ) {}

    /** 입고 전환: 어느 창고로 받을지 지정해야 구매전표를 만들 수 있다. */
    public record ReceiveRequest(
            @NotNull(message = "입고 창고를 선택하세요.") Long warehouseId,
            LocalDate purchaseDate
    ) {}

    public record OrderLineResponse(
            Long id, int lineNo,
            Long itemId, String itemCode, String itemName, String unit,
            /** 원본 조건·열의 <b>[규격]</b>. 품목은 이미 물고 오는데 이 칸만 안 실어 못 걸렀다. */
            String spec,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            Long partnerId, String partnerName, String remark
    ) {
        public static OrderLineResponse from(PurchaseOrderLine l) {
            return new OrderLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getItem().getSpec(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    l.getPartner() != null ? l.getPartner().getId() : null,
                    l.getPartner() != null ? l.getPartner().getName() : null,
                    l.getRemark());
        }
    }

    public record PurchaseOrderResponse(
            Long id, String orderNo, LocalDate orderDate, LocalDate dueDate,
            /** 원본 [유효기간]. 안 정했으면 null. 납기일과 다른 값이다. */
            LocalDate priceValidUntil,
            Long partnerId, String partnerName,
            Long employeeId, String employeeName,
            Long warehouseId, String warehouseName,
            Long projectId, String projectName, String currency,
            PurchaseOrderStatus status, String statusName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            Boolean taxable, Long convertedPurchaseId, String remark, String createdBy,
            List<OrderLineResponse> lines
    ) {
        public static PurchaseOrderResponse from(PurchaseOrder po) {
            return new PurchaseOrderResponse(
                    po.getId(), po.getOrderNo(), po.getOrderDate(), po.getDueDate(),
                    po.getPriceValidUntil(),
                    po.getPartner().getId(), po.getPartner().getName(),
                    po.getEmployee() != null ? po.getEmployee().getId() : null,
                    po.getEmployee() != null ? po.getEmployee().getName() : null,
                    po.getWarehouse() != null ? po.getWarehouse().getId() : null,
                    po.getWarehouse() != null ? po.getWarehouse().getName() : null,
                    po.getProject() != null ? po.getProject().getId() : null,
                    po.getProject() != null ? po.getProject().getName() : null,
                    po.getCurrency(),
                    po.getStatus(), po.getStatus().getDisplayName(),
                    po.getSupplyAmount(), po.getVatAmount(), po.getTotalAmount(),
                    po.getTaxable(), po.getConvertedPurchaseId(), po.getRemark(), po.getCreatedBy(),
                    po.getLines().stream().map(OrderLineResponse::from).toList());
        }
    }

    /** 발주 파이프라인 상태별 집계 한 줄(발주요청·계획·단가확정·발주확정·입고전환·취소). */
    public record PurchaseOrderSummaryRow(
            PurchaseOrderStatus status, String statusName,
            long count, BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount
    ) {}

    /**
     * 원본 단가요청진행단계 격자의 <b>[이력]</b> 한 줄 — 언제 어느 단계로 넘어갔나.
     *
     * <p>목록 응답에 끼워 넣지 않는다. 줄마다 이력을 달면 <b>보지도 않을 자취까지</b>
     * 전부 실어 나른다 — 펼칠 때 그 발주만 가져간다.
     */
    public record HistoryRow(
            java.time.LocalDateTime changedAt,
            String fromStatusName,
            String toStatusName,
            String changedBy,
            String note
    ) {
        public static HistoryRow from(com.erp.trade.domain.PurchaseOrderHistory h) {
            return new HistoryRow(
                    h.getChangedAt(),
                    h.getFromStatus() != null ? h.getFromStatus().getDisplayName() : null,
                    h.getToStatus().getDisplayName(),
                    h.getChangedBy(), h.getNote());
        }
    }
}
