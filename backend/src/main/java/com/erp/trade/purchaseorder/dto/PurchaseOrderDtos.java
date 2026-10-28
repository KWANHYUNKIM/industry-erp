package com.erp.trade.purchaseorder.dto;

import com.erp.inventory.item.ItemCategory;
import com.erp.trade.purchaseorder.PurchaseOrder;
import com.erp.trade.purchaseorder.PurchaseOrderLine;
import com.erp.trade.purchaseorder.PurchaseOrderStatus;
import com.erp.trade.purchaseorder.PurchaseRequestProgress;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
            String remark,
            /** 베껴 온 앞 전표의 줄(발주계획 ← 발주요청 줄, 발주서 ← 발주계획 줄). 비우면 직접 넣은 줄. */
            Long sourceLineId,
            /** 줄 규격(선택). 비우면(null) 품목 규격, 빈 글자는 일부러 비운 것. */
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String spec
    ) {}

    public record CreatePurchaseOrderRequest(
            Long partnerId,
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
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<OrderLineRequest> lines,
            /**
             * 원본 메뉴 <b>발주계획입력</b>(E040316)에서 넣은 것 — 요청을 거치지 않고 바로 [발주계획] 단계로 만든다.
             * 비우면 예전처럼 발주요청(REQUESTED)이다.
             */
            Boolean plan,
            /**
             * 원본 <b>발주서입력</b> — 발주계획조회 [다른전표생성 › 발주서 › 1장라인별] 이 띄우는 창. 바로 발주서(발주확정)로 만든다.
             * 계획 · 요청은 그대로 두고 새 전표가 된다(원본 실측: 계획은 진행중 그대로).
             */
            Boolean order,
            /** 원본 <b>단가요청입력</b>(E040321) — 단가요청(PRICE_REQUESTED) 전표로 만든다. 줄 단가가 요청단가다. */
            Boolean priceRequest
    ) {}

    /** 단가요청진행단계 [수취단가확인] · [단가확정] — 줄마다 수취단가 · 확정단가, 머리 [유효기간]. 비운 값은 그대로 둔다. */
    public record PriceStepRequest(
            @NotEmpty(message = "줄을 1개 이상 보내세요.") @Valid List<PriceStepLine> lines,
            LocalDate priceValidUntil
    ) {}

    public record PriceStepLine(
            @NotNull Long lineId,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal receivedPrice,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal confirmedPrice
    ) {}

    /**
     * 발주계획조회 격자에서 그 줄을 바로 고친다(원본 C000076, 2026-10-13 실측) — 수량 · 단가 칸은 입력칸이고
     * 칸을 벗어나면 저장된다. [종결여부] '종결' · 완료 탭의 '취소' 도 이 줄 하나만 바꾼다. 비운 값은 그대로 둔다.
     */
    public record PlanLineRequest(
            /* 0 은 받는다 — [수량조정] 계산이 0 을 내고(원본 C004 7 + 3,070 − 14,620 − 10,800 → 0), 조회 조건에도 [수량0] 이 있다. */
            @PositiveOrZero(message = "수량은 0 이상이어야 합니다.") BigDecimal quantity,
            @PositiveOrZero(message = "단가는 0 이상이어야 합니다.") BigDecimal unitPrice,
            Boolean closed,
            /** [수량조정] 창에서 저장했다 — [최종계산일자] 를 오늘로. 격자에서 칸을 고친 것은 계산이 아니다. */
            Boolean calculated
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
            /**
             * 원본 조건 <b>[품목구분]</b>. 발주계획·단가요청을 볼 때 원자재를 사는 건인지
             * 상품을 사는 건인지로 먼저 갈라 본다. 품목 마스터의 값이라 실어 주기만 한다.
             */
            ItemCategory itemCategory, String itemCategoryName,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            Long partnerId, String partnerName, String remark,
            /** 발주계획 [종결여부] — 이 줄을 종결했나. */
            boolean planClosed,
            /** [수량조정] 창의 [입력수량] · [최종계산일자]. */
            BigDecimal inputQuantity, LocalDate planCalcDate,
            /** 베껴 온 앞 전표의 줄 · 그 전표 번호 · 일자(원본 줄 열 [발주요청] · [No]). */
            Long sourceLineId, String sourceOrderNo, LocalDate sourceOrderDate,
            /** 단가요청의 수취단가 · 확정단가(요청단가는 unitPrice). */
            BigDecimal receivedPrice, BigDecimal confirmedPrice
    ) {
        public static OrderLineResponse from(PurchaseOrderLine l) {
            return new OrderLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.effectiveSpec(),
                    l.getItem().getCategory(),
                    l.getItem().getCategory() != null ? l.getItem().getCategory().getDisplayName() : null,
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    l.getPartner() != null ? l.getPartner().getId() : null,
                    l.getPartner() != null ? l.getPartner().getName() : null,
                    l.getRemark(),
                    l.isPlanClosed(),
                    l.getInputQuantity() != null ? l.getInputQuantity() : l.getQuantity(), l.getPlanCalcDate(),
                    l.getSourceLineId(), l.getSourceOrderNo(), l.getSourceOrderDate(),
                    l.getReceivedPrice(), l.getConfirmedPrice());
        }
    }

    /**
     * 아직 구매로 안 끊은 발주 줄(발주 − 구매). 구매입력 [발주] 불러오기가 쓴다.
     * 예전엔 발주수량 전체를 담아, 100 중 60 을 입고한 뒤 다시 불러오면 또 100 이 떴다(42회차).
     * 판매 쪽 /sales-orders/unsold 와 같은 잣대.
     */
    public record UnpurchasedLineResponse(
            Long orderId, String orderNo, Long orderLineId, LocalDate orderDate,
            Long partnerId, String partnerName, String statusName,
            Long warehouseId, Long projectId,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal orderQty, BigDecimal boughtQty, BigDecimal restQty, BigDecimal unitPrice,
            /** 발주의 담당자 — 원본 구매입력 [발주] 불러오기가 머리 담당자로 채운다(2026-10-28 실측). */
            Long employeeId,
            /** 발주 줄의 규격 — 구매입력 [발주] 불러오기가 줄 규격으로 채운다. */
            String spec
    ) {}

    /**
     * 발주서조회 [진행상태] '조회' → '생성한 전표' 창 한 줄(2026-10-28 원본 실측).
     * 품목코드 · 품목명 · 규격 · 수량 · 잔량 · 생성한 전표 · 생성한 전표일자-No. slipId 는 일자-No. 링크(구매전표 인쇄)용.
     */
    public record GeneratedSlipRow(
            Long orderLineId, Long itemId, String itemCode, String itemName, String spec,
            BigDecimal quantity, BigDecimal remaining, BigDecimal unitPrice,
            String slipType, LocalDate slipDate, String slipNo, Long slipId
    ) {}

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
            /** 원본 발주계획조회 [최종수정자]. */
            String updatedBy,
            /**
             * 만든 때 · 고친 때. 원본 발주서조회 조건의 [최초작성일자] · [최종작업일자] 와
             * [기타] 의 <b>수정일자순(정렬)</b> 이 이 두 값을 본다. PurchaseOrder 는
             * BaseTimeEntity 를 물려받아 진작 채우고 있는데 응답이 안 실었다.
             */
            LocalDateTime createdAt, LocalDateTime updatedAt,
            /** 발주요청 [종결여부] — 사람이 정한 것. null 이면 발주 흐름으로 본다. */
            PurchaseRequestProgress requestProgress,
            List<OrderLineResponse> lines
    ) {
        public static PurchaseOrderResponse from(PurchaseOrder po) {
            return new PurchaseOrderResponse(
                    po.getId(), po.getOrderNo(), po.getOrderDate(), po.getDueDate(),
                    po.getPriceValidUntil(),
                    po.getPartner() != null ? po.getPartner().getId() : null, po.getPartner() != null ? po.getPartner().getName() : null,
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
                    po.getUpdatedBy(),
                    po.getCreatedAt(), po.getUpdatedAt(),
                    po.getRequestProgress(),
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
        public static HistoryRow from(com.erp.trade.purchaseorder.PurchaseOrderHistory h) {
            return new HistoryRow(
                    h.getChangedAt(),
                    h.getFromStatus() != null ? h.getFromStatus().getDisplayName() : null,
                    h.getToStatus().getDisplayName(),
                    h.getChangedBy(), h.getNote());
        }
    }
}
