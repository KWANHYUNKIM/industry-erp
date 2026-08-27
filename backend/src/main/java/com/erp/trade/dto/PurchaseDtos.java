package com.erp.trade.dto;

import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.PurchaseLine;
import com.erp.trade.domain.PurchaseOrder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class PurchaseDtos {

    private PurchaseDtos() {}

    public record PurchaseLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull(message = "단가를 입력하세요.") @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice,
            String remark,
            /** 시리얼/로트 번호 (선택) */
            String lotNo,
            /** 부대비용 (선택). 합계에는 더하지 않는다. */
            BigDecimal extraCost,
            /** 이 줄을 담아 온 근거전표(발주서) id. 직접 입력한 줄은 null. */
            Long sourceOrderId
    ) {}

    public record CreatePurchaseRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            LocalDate purchaseDate,
            Boolean taxable,
            String remark,
            /** 귀속 프로젝트 (선택) */
            Long projectId,
            /** 담당 사원 (선택). 실적이 붙을 사람이다. */
            Long employeeId,
            /** 거래별부가세계산 — 전표 합계에 한 번 반올림한다. 비우면 라인별 반올림(기존 동작). */
            Boolean vatBySlip,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<PurchaseLineRequest> lines
    ) {}

    public record PurchaseLineResponse(
            /**
             * 라인 id. 수주는 예전부터 주는데 판매·구매만 빠져 있었다 —
             * 라인을 지목할 키가 없으면 라인 단위로 아무것도 붙일 수 없다
             * (원본 판매입력II 그리드의 추가항목 열이 그런 것이다).
             */
            Long lineId,
            Long itemId, String itemCode, String itemName, String unit, String spec,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            String remark, String lotNo, BigDecimal extraCost,
            /** 불러온 전표 — 원본 그리드의 [불러온 전표 / 전표일자 / 전표No.] 3열. 없으면 전부 null. */
            Long sourceOrderId, String sourceDocType, LocalDate sourceDocDate, String sourceDocNo
    ) {
        static PurchaseLineResponse from(PurchaseLine l) {
            PurchaseOrder src = l.getSourceOrder();
            return new PurchaseLineResponse(
                    l.getId(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(), l.getItem().getSpec(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    l.getRemark(), l.getLotNo(), l.getExtraCost(),
                    src == null ? null : src.getId(),
                    src == null ? null : "발주서",
                    src == null ? null : src.getOrderDate(),
                    src == null ? null : src.getOrderNo());
        }
    }

    /** 구매/외주 할인현황 라인 행 (품목 기준단가 대비 실매입단가 할인) */
    /**
     * 할인 한 줄.
     *
     * <p>원본 할인현황의 조건 판은 창고·프로젝트·거래처관리담당자로도 거른다.
     * 그 값들은 전표에 이미 있는데 응답에 안 실어서 화면이 거를 수가 없었다 — 같이 보낸다.
     */
    public record PurchaseDiscountRow(
            LocalDate date, String docNo, String partnerName, String itemCode, String itemName,
            String warehouseName, String projectName, String employeeName,
            BigDecimal qty, BigDecimal basePrice, BigDecimal buyPrice,
            BigDecimal discountPerUnit, BigDecimal discountAmount, BigDecimal discountRate
    ) {}

    public record PurchaseResponse(
            Long id, String docNo,
            Long partnerId, String partnerName,
            Long warehouseId, String warehouseName,
            LocalDate purchaseDate,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String remark, String createdBy,
            /** 부가세를 전표 단위로 계산한 전표인가 (거래별부가세계산) */
            boolean vatBySlip,
            /** 과세 전표인가. 원본 일괄회계반영의 [부가세유형] (과세 · 면세). */
            boolean taxable,
            /**
             * 회계반영 여부. 엔티티에는 있었는데 응답에 빠져 있어서 구매조회가 이 열을 못 그렸다
             * (판매는 SalesResponse 가 이미 주고 있다 — 두 쪽이 어긋나 있었다).
             */
            boolean accountingReflected,
            Long projectId, String projectName,
            Long employeeId, String employeeName,
            List<PurchaseLineResponse> lines
    ) {
        public static PurchaseResponse from(Purchase p) {
            return new PurchaseResponse(
                    p.getId(), p.getDocNo(),
                    p.getPartner().getId(), p.getPartner().getName(),
                    p.getWarehouse().getId(), p.getWarehouse().getName(),
                    p.getPurchaseDate(),
                    p.getSupplyAmount(), p.getVatAmount(), p.getTotalAmount(),
                    p.getRemark(), p.getCreatedBy(),
                    p.isVatBySlip(),
                    p.isTaxable(),
                    p.isAccountingReflected(),
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getEmployee() != null ? p.getEmployee().getId() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getLines().stream().map(PurchaseLineResponse::from).toList());
        }
    }
}
