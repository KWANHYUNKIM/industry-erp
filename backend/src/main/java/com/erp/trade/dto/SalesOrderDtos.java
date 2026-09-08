package com.erp.trade.dto;

import com.erp.trade.domain.SalesOrder;
import com.erp.trade.domain.SalesOrderLine;
import com.erp.trade.domain.SalesOrderStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
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
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull(message = "단가를 입력하세요.") @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice
    ) {}

    public record CreateSalesOrderRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            LocalDate orderDate,
            LocalDate dueDate,
            /* 원본 수주의 [창고]·[프로젝트]·[담당자]. 수주 시점에 안 정했을 수 있어 필수가 아니다. */
            Long warehouseId,
            Long projectId,
            Long employeeId,
            Boolean taxable,
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.")
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<OrderLineRequest> lines
    ) {}

    public record UpdateStatusRequest(
            @NotNull(message = "진행상태를 선택하세요.") SalesOrderStatus status
    ) {}

    public record OrderLineResponse(
            Long lineId, Long itemId, String itemCode, String itemName, String unit,
            /**
             * 규격 — 2026-09-08 원본 주문서현황(E040209)의 조건이다.
             *
             * <p>같은 파일의 미출하·미판매 응답은 규격을 이미 싣는데 <b>이 응답만 빠져</b>
             * 있었다. 그래서 주문서현황은 [규격] 조건을 '못 만드는 것' 으로 적어 두어야 했고,
             * 그 이유에는 근거를 달 수도 없었다(파일 단위로는 spec 이 있으니까).
             * 없던 것은 <b>줄</b>이지 파일이 아니었다 — 품목 마스터의 값을 실기만 하면 된다.
             */
            String spec,
            BigDecimal quantity, BigDecimal shippedQty, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount
    ) {
        static OrderLineResponse from(SalesOrderLine l) {
            return new OrderLineResponse(
                    l.getId(), l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getItem().getSpec(),
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
            BigDecimal orderQty, BigDecimal shippedQty, BigDecimal unshippedQty,
            /* 원본 미출하현황 조건의 [창고]·[프로젝트]·[담당자]. 수주에 이번에 만든 칸이다. */
            Long warehouseId, String warehouseName,
            Long projectId, String projectName,
            Long employeeId, String employeeName,
            /**
             * 적요 — 원본 미출하현황의 열이다(일자-No. · 품목명(규격) · 수량 · 미출하수량 ·
             * 창고명 · 거래처명 · <b>적요</b> · 출하예정일).
             *
             * <p>주문서에 적어 둔 말이 미출하현황에서 사라지면, 왜 아직 안 나갔는지
             * 적어 둬도 그 화면에서는 볼 수가 없다.
             */
            String remark,
            /**
             * 이 줄에 <b>이미 나가 있는 출하지시 전표번호</b>(READY). 여럿이면 쉼표로 잇는다.
             * 원본 미출하현황의 [출하지시No.] 조건이 가리키는 값이다.
             */
            String shipNos,
            /**
             * 규격 · 작성자 — 2026-09-08 원본 미출하현황(E040228)의 접힌 줄을 펼쳐 재니
             * 둘 다 조건으로 있다. 품목 마스터와 수주 전표가 진작 들고 있는 값인데
             * 응답이 안 실어 화면이 거를 수가 없었다. 열([품목명(규격)])에는 규격을
             * 이미 붙여 그리면서 정작 그 값을 따로 주지 않아, 화면이 이름에서 되짚어야 했다.
             */
            String spec, String createdBy
    ) {
        /**
         * @param committed 이 라인에 <b>이미 잡힌</b> 출하수량 — 출하지시(READY)와 출하완료(SHIPPED)를 더한 값.
         *
         * <p>예전에는 {@code l.getShippedQty()}(출하<b>완료</b>분)로 미출하를 냈다.
         * 그러면 출하지시만 낸 수량이 계속 '미출하'로 남아, 화면을 믿고 다시 지시를 내면
         * "출하수량이 잔량을 초과합니다" 로 거부당했다. 화면이 말하는 미출하수량과
         * 실제로 낼 수 있는 잔량이 서로 달랐던 것이다.
         */
        public static UnshippedLineResponse of(SalesOrder o, SalesOrderLine l, BigDecimal committed,
                                               String shipNos) {
            BigDecimal orderQty = l.getQuantity();
            BigDecimal shipped = committed != null ? committed : BigDecimal.ZERO;
            return new UnshippedLineResponse(
                    o.getId(), o.getOrderNo(), l.getId(),
                    o.getPartner().getId(), o.getPartner().getName(),
                    o.getOrderDate(), o.getDueDate(),
                    o.getStatus(), o.getStatus().getDisplayName(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    orderQty, shipped, orderQty.subtract(shipped),
                    o.getWarehouse() != null ? o.getWarehouse().getId() : null,
                    o.getWarehouse() != null ? o.getWarehouse().getName() : null,
                    o.getProject() != null ? o.getProject().getId() : null,
                    o.getProject() != null ? o.getProject().getName() : null,
                    o.getEmployee() != null ? o.getEmployee().getId() : null,
                    o.getEmployee() != null ? o.getEmployee().getName() : null,
                    o.getRemark(), shipNos,
                    l.getItem().getSpec(), o.getCreatedBy());
        }
    }

    /**
     * 미판매현황(이카운트 E040212) 한 줄.
     * 미판매수량 = 주문수량 − 그 수주를 근거로 끊은 판매 전표의 같은 품목 수량 합.
     */
    public record UnsoldLineResponse(
            Long orderId, String orderNo, Long orderLineId,
            Long partnerId, String partnerName,
            LocalDate orderDate, LocalDate dueDate,
            SalesOrderStatus status, String statusName,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal orderQty, BigDecimal soldQty, BigDecimal unsoldQty,
            BigDecimal unitPrice, BigDecimal unsoldAmount,
            /**
             * 창고 · 프로젝트 · 담당자 · 적요 · 규격 · 작성자 —
             * 2026-09-08 원본 미판매현황(E040212)의 접힌 줄을 펼쳐 재니 여섯 다 조건으로 있다.
             *
             * <p>수주 전표와 품목 마스터가 진작 들고 있는 값인데 이 응답만 안 실어,
             * 화면이 거를 수가 없었다. <b>같은 파일의 미출하 응답은 이미 싣는다</b> —
             * 미출하와 미판매는 같은 수주를 다른 잣대로 보는 화면이라 조건도 거의 같다.
             */
            Long warehouseId, String warehouseName,
            Long projectId, String projectName,
            Long employeeId, String employeeName,
            String remark, String spec, String createdBy,
            /**
             * 과세 전표인가 — 원본 미판매현황(E040212)의 <b>[거래유형]</b> 이 쓰는 값.
             *
             * <p>앞서 "과세·면세를 수주에서 정하지 않는다" 고 적어 두었는데 틀린 말이었다 —
             * <code>CreateSalesOrderRequest</code> 가 <code>taxable</code> 을 받고
             * <code>SalesOrderService</code> 가 그것으로 부가세를 매긴다. 엔티티에 칸이
             * 없을 뿐이라 서비스와 같은 방식으로 <b>전표 부가세에서 되짚는다.</b>
             *
             * <p>줄에는 부가세가 없어(미판매수량·금액만 낸다) 화면이 스스로 되짚을 수 없다 —
             * 그래서 값을 여기서 실어 준다.
             */
            boolean taxable
    ) {
        public static UnsoldLineResponse of(SalesOrder o, SalesOrderLine l, BigDecimal sold) {
            BigDecimal orderQty = l.getQuantity();
            BigDecimal soldQty = sold != null ? sold : BigDecimal.ZERO;
            // 주문보다 많이 판 경우(추가 판매)는 미판매를 음수로 두지 않는다 — 0 이 사실에 가깝다.
            BigDecimal unsold = orderQty.subtract(soldQty).max(BigDecimal.ZERO);
            BigDecimal price = l.getUnitPrice() != null ? l.getUnitPrice() : BigDecimal.ZERO;
            return new UnsoldLineResponse(
                    o.getId(), o.getOrderNo(), l.getId(),
                    o.getPartner().getId(), o.getPartner().getName(),
                    o.getOrderDate(), o.getDueDate(),
                    o.getStatus(), o.getStatus().getDisplayName(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    orderQty, soldQty, unsold,
                    price, unsold.multiply(price),
                    o.getWarehouse() != null ? o.getWarehouse().getId() : null,
                    o.getWarehouse() != null ? o.getWarehouse().getName() : null,
                    o.getProject() != null ? o.getProject().getId() : null,
                    o.getProject() != null ? o.getProject().getName() : null,
                    o.getEmployee() != null ? o.getEmployee().getId() : null,
                    o.getEmployee() != null ? o.getEmployee().getName() : null,
                    o.getRemark(), l.getItem().getSpec(), o.getCreatedBy(),
                    o.getVatAmount() != null && o.getVatAmount().signum() > 0);
        }
    }

    /** 출하처리 요청: 주문 라인별 출하수량. lines 비우면 전 라인 잔량 전체출하. */
    public record ShipLineRequest(
            @NotNull(message = "주문라인을 지정하세요.") Long orderLineId,
            @NotNull(message = "출하수량을 입력하세요.") @Positive(message = "출하수량은 0보다 커야 합니다.") BigDecimal qty
    ) {}

    public record ShipRequest(
            @Valid List<ShipLineRequest> lines
    ) {}

    public record SalesOrderResponse(
            Long id, String orderNo,
            Long partnerId, String partnerName,
            LocalDate orderDate, LocalDate dueDate,
            /* 원본 수주의 [창고]·[프로젝트]·[담당자]. 견적에서 정한 것이 여기로 넘어온다. */
            Long warehouseId, String warehouseName,
            Long projectId, String projectName,
            Long employeeId, String employeeName,
            SalesOrderStatus status, String statusName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String remark, String createdBy,
            /*
             * 원본 오더관리진행단계(C000651) 조건 [기타]의 <b>[수정일자순(정렬)]</b> 이 쓰는 축
             * (2026-09-01 실측). 그 축이 응답에 없어 정렬을 만들 수 없었다 —
             * BaseTimeEntity 가 이미 들고 있는 값이라 싣기만 하면 된다.
             */
            java.time.LocalDateTime updatedAt,
            /**
             * 오더관리 유형과 현재 진행단계.
             *
             * <p>엔티티에는 예전부터 있었는데 <b>응답에 빠져 있어</b> 화면에서 볼 수도
             * 고를 수도 없었다. 그래서 오더관리진행단계 화면은 단계 <b>마스터</b>만
             * 나열했고, 정작 "이 오더가 지금 어디까지 갔나" 는 어디에도 없었다.
             */
            Long orderTypeId, String orderTypeName,
            Long stageId, String stageName,
            List<OrderLineResponse> lines
    ) {
        public static SalesOrderResponse from(SalesOrder o) {
            return new SalesOrderResponse(
                    o.getId(), o.getOrderNo(),
                    o.getPartner().getId(), o.getPartner().getName(),
                    o.getOrderDate(), o.getDueDate(),
                    o.getWarehouse() != null ? o.getWarehouse().getId() : null,
                    o.getWarehouse() != null ? o.getWarehouse().getName() : null,
                    o.getProject() != null ? o.getProject().getId() : null,
                    o.getProject() != null ? o.getProject().getName() : null,
                    o.getEmployee() != null ? o.getEmployee().getId() : null,
                    o.getEmployee() != null ? o.getEmployee().getName() : null,
                    o.getStatus(), o.getStatus().getDisplayName(),
                    o.getSupplyAmount(), o.getVatAmount(), o.getTotalAmount(),
                    o.getRemark(), o.getCreatedBy(),
                    o.getUpdatedAt(),
                    o.getOrderType() != null ? o.getOrderType().getId() : null,
                    o.getOrderType() != null ? o.getOrderType().getName() : null,
                    o.getStage() != null ? o.getStage().getId() : null,
                    o.getStage() != null ? o.getStage().getName() : null,
                    o.getLines().stream().map(OrderLineResponse::from).toList());
        }
    }
}
