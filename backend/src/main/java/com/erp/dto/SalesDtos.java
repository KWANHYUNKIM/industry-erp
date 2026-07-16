package com.erp.dto;

import com.erp.domain.Sales;
import com.erp.domain.SalesConfirmStatus;
import com.erp.domain.SalesLine;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class SalesDtos {

    private SalesDtos() {}

    public record SalesLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice,
            String remark
    ) {}

    public record CreateSalesRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            LocalDate saleDate,
            /** 과세 여부 (true=부가세 10%, false=면세) */
            Boolean taxable,
            String remark,
            /** 귀속 프로젝트 (선택). 프로젝트별 손익 집계의 재료가 된다. */
            Long projectId,
            /** 담당 사원 (선택). 입력 계정(createdBy)이 아니라 실적이 붙을 사람이다. */
            Long employeeId,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<SalesLineRequest> lines
    ) {}

    public record SalesLineResponse(
            Long itemId, String itemCode, String itemName, String unit, String spec,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            String remark
    ) {
        static SalesLineResponse from(SalesLine l) {
            return new SalesLineResponse(
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(), l.getItem().getSpec(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    l.getRemark());
        }
    }

    /** 판매할인현황 라인 행 (품목 기준단가 대비 실판매단가 할인) */
    public record SalesDiscountRow(
            LocalDate date, String docNo, String partnerName, String itemName,
            BigDecimal qty, BigDecimal basePrice, BigDecimal salePrice,
            BigDecimal discountPerUnit, BigDecimal discountAmount, BigDecimal discountRate
    ) {}

    public record SalesResponse(
            Long id, String docNo,
            Long partnerId, String partnerName,
            Long warehouseId, String warehouseName,
            LocalDate saleDate,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String remark, String createdBy,
            SalesConfirmStatus confirmStatus, String confirmStatusName, LocalDateTime confirmedAt,
            boolean accountingReflected,
            Long projectId, String projectName,
            Long employeeId, String employeeName,
            List<SalesLineResponse> lines
    ) {
        public static SalesResponse from(Sales s) {
            return new SalesResponse(
                    s.getId(), s.getDocNo(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    s.getWarehouse().getId(), s.getWarehouse().getName(),
                    s.getSaleDate(),
                    s.getSupplyAmount(), s.getVatAmount(), s.getTotalAmount(),
                    s.getRemark(), s.getCreatedBy(),
                    s.getConfirmStatus(), s.getConfirmStatus().getDisplayName(), s.getConfirmedAt(),
                    s.isAccountingReflected(),
                    s.getProject() != null ? s.getProject().getId() : null,
                    s.getProject() != null ? s.getProject().getName() : null,
                    s.getEmployee() != null ? s.getEmployee().getId() : null,
                    s.getEmployee() != null ? s.getEmployee().getName() : null,
                    s.getLines().stream().map(SalesLineResponse::from).toList());
        }
    }
}
