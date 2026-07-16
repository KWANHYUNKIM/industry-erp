package com.erp.dto;

import com.erp.domain.Purchase;
import com.erp.domain.PurchaseLine;
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
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice,
            String remark
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
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<PurchaseLineRequest> lines
    ) {}

    public record PurchaseLineResponse(
            Long itemId, String itemCode, String itemName, String unit, String spec,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            String remark
    ) {
        static PurchaseLineResponse from(PurchaseLine l) {
            return new PurchaseLineResponse(
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(), l.getItem().getSpec(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    l.getRemark());
        }
    }

    /** 구매/외주 할인현황 라인 행 (품목 기준단가 대비 실매입단가 할인) */
    public record PurchaseDiscountRow(
            LocalDate date, String docNo, String partnerName, String itemName,
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
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getEmployee() != null ? p.getEmployee().getId() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getLines().stream().map(PurchaseLineResponse::from).toList());
        }
    }
}
