package com.erp.quality.asrepair.dto;

import com.erp.quality.asrepair.AsRepair;
import com.erp.quality.asrepair.AsRepairLine;
import com.erp.quality.asrepair.AsRepairStatus;
import com.erp.quality.asrepair.AsRepairType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class AsRepairDtos {

    private AsRepairDtos() {}

    public record RepairLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity
    ) {}

    public record RepairRequest(
            LocalDate repairDate,
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            /* 원본은 [담당자] 없이 저장하지 않는다(2026-10-03 실측, 빨간 테두리). */
            @NotBlank(message = "담당자를 입력하세요.") @Size(max = 50) String charge,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            Long asRequestId,
            AsRepairType repairType,
            @Size(max = 200) String title,
            @Size(max = 1000) String content,
            AsRepairStatus status,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") List<@Valid RepairLineRequest> lines
    ) {}

    public record RepairLineResponse(Long id, int lineNo, Long itemId, String itemCode, String itemName,
                                     String itemSpec, BigDecimal quantity) {
        public static RepairLineResponse from(AsRepairLine l) {
            return new RepairLineResponse(l.getId(), l.getLineNo(), l.getItem().getId(), l.getItem().getCode(),
                    l.getItem().getName(), l.getItem().getSpec(), l.getQuantity());
        }
    }

    /** 원본 [판매연결전표] 한 장. */
    public record LinkedSale(Long salesId, String docNo, LocalDate saleDate, BigDecimal supplyAmount,
                             BigDecimal vatAmount, BigDecimal totalAmount) {}

    public record RepairResponse(
            Long id, String repairNo, LocalDate repairDate,
            Long partnerId, String partnerName,
            Long asRequestId, String asNo, LocalDate receiptDate,
            /** 원본 A/S수리현황 조건 [접수담당자] — 불러온 접수의 담당자. */
            String receiptCharge,
            Long warehouseId, String warehouseName,
            String charge, AsRepairType repairType, String repairTypeCode, String repairTypeName,
            String title, String content,
            AsRepairStatus status, String statusName,
            List<RepairLineResponse> lines,
            /** 원본 [소모(판매)금액] · 수리조회 [금액] — 판매연결전표 합계. */
            BigDecimal saleAmount,
            List<LinkedSale> sales,
            String createdBy, LocalDateTime createdAt, LocalDateTime updatedAt
    ) {
        public static RepairResponse from(AsRepair r, List<LinkedSale> sales) {
            BigDecimal amount = sales.stream().map(LinkedSale::totalAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            return new RepairResponse(r.getId(), r.getRepairNo(), r.getRepairDate(),
                    r.getPartner().getId(), r.getPartner().getName(),
                    r.getAsRequest() != null ? r.getAsRequest().getId() : null,
                    r.getAsRequest() != null ? r.getAsRequest().getAsNo() : null,
                    r.getAsRequest() != null ? r.getAsRequest().getReceiptDate() : null,
                    r.getAsRequest() != null ? r.getAsRequest().getCharge() : null,
                    r.getWarehouse().getId(), r.getWarehouse().getName(),
                    r.getCharge(), r.getRepairType(),
                    r.getRepairType() != null ? r.getRepairType().code() : null,
                    r.getRepairType() != null ? r.getRepairType().label() : null,
                    r.getTitle(), r.getContent(), r.getStatus(), r.getStatus().label(),
                    r.getLines().stream().map(RepairLineResponse::from).toList(),
                    amount, sales, r.getCreatedBy(), r.getCreatedAt(), r.getUpdatedAt());
        }
    }

    /** [판매연결전표] [신규] — 부품 · 수리비 줄. 판매가 재고를 빼고 매출을 잡는다. */
    public record SaleLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull(message = "단가를 입력하세요.") @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice
    ) {}

    /** 목록 [진행상태변경]. */
    public record StatusRequest(AsRepairStatus status) {}

    public record LinkSaleRequest(
            LocalDate saleDate,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") List<@Valid SaleLineRequest> lines
    ) {}

    /**
     * A/S소모현황(E040641) 한 줄 — 원본 열 [수리번호 · 수리품목명 · 수리담당자 · 소모(판매)번호 · 소모부품명 · 수량 ·
     * 단가 · 공급가액 · 부가세](2026-10-03 실측). 소모 = 수리에 이어진 판매의 줄이다. 조건이 거르는 값도 싣는다.
     */
    public record ConsumptionLine(
            Long repairId, String repairNo, LocalDate repairDate,
            Long repairItemId, String repairItemName, String charge,
            AsRepairType repairType, AsRepairStatus status, String title, String content, String createdBy,
            Long partnerId, String partnerName, Long warehouseId,
            LocalDate receiptDate, String receiptCharge, Long projectId,
            Long salesId, String salesDocNo, LocalDate saleDate,
            Long itemId, String itemName, BigDecimal quantity, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount
    ) {}
}
