package com.erp.trade.export.dto;

import com.erp.trade.export.ExportOrder;
import com.erp.trade.export.ExportOrderLine;
import com.erp.trade.export.ExportStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ExportDtos {

    private ExportDtos() {}

    public record ExportLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull(message = "외화 단가를 입력하세요.") @Positive(message = "외화 단가를 입력하세요.") BigDecimal unitPrice,
            /* 원본 품목 격자의 패킹리스트 칸 — 비워도 된다. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String unit,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.") String marks,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String description,
            @PositiveOrZero(message = "중량은 0 이상이어야 합니다.") BigDecimal netWeight,
            @PositiveOrZero(message = "중량은 0 이상이어야 합니다.") BigDecimal grossWeight,
            @PositiveOrZero(message = "Measurement 는 0 이상이어야 합니다.") BigDecimal measurement
    ) {}

    /** 수출 인보이스 발행. 원화 환산은 발행일 고시환율로 서버가 고정한다. */
    public record CreateExportRequest(
            @NotNull(message = "수입자를 선택하세요.") Long partnerId,
            @NotNull(message = "통화를 선택하세요.") Long currencyId,
            LocalDate invoiceDate,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String incoterms,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String destination,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<ExportLineRequest> lines,
            /* 원본 Invoice/Packing List 입력 머리(2026-10-04 실측). [일자]를 안 주면 Invoice 일자, Invoice 번호를 안 주면 서버가 매긴다. */
            LocalDate voucherDate,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.") String invoiceNo,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String lcNo,
            LocalDate lcDate,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String lcBank,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String shipper,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String messrs,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String notifyParty,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String portOfLoading,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.") String carrier,
            LocalDate sailingDate,
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.") String weightUnit
    ) {}

    /** 원본 [진행상태변경] — 미확인 ↔ 확인. */
    public record ConfirmRequest(boolean confirmed) {}

    /** 통관진행: 수출신고번호를 받는다. */
    public record CustomsRequest(
            @Size(max = 50, message = "수출신고번호는 50자까지 넣을 수 있습니다.")
            @NotNull(message = "수출신고번호를 입력하세요.") String declarationNo
    ) {}

    /** 선적완료: B/L 번호와 선적일. */
    public record ShipRequest(
            @Size(max = 50, message = "B/L 번호는 50자까지 넣을 수 있습니다.")
            @NotNull(message = "B/L 번호를 입력하세요.") String blNo,
            LocalDate shippedDate
    ) {}

    /** 입금완료 */
    public record PayRequest(LocalDate paidDate) {}

    public record ExportLineResponse(
            Long id, int lineNo,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal amount,
            String marks, String description, BigDecimal netWeight, BigDecimal grossWeight, BigDecimal measurement
    ) {
        public static ExportLineResponse from(ExportOrderLine l) {
            return new ExportLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(),
                    l.getUnit() != null && !l.getUnit().isBlank() ? l.getUnit() : l.getItem().getUnit(),
                    l.getQuantity(), l.getUnitPrice(), l.getAmount(),
                    l.getMarks(), l.getDescription(), l.getNetWeight(), l.getGrossWeight(), l.getMeasurement());
        }
    }

    public record ExportResponse(
            Long id, String invoiceNo, LocalDate invoiceDate,
            Long partnerId, String buyerName,
            Long currencyId, String currencyCode, String currencySymbol,
            BigDecimal foreignAmount, BigDecimal appliedRate, BigDecimal krwAmount,
            String incoterms, String destination,
            ExportStatus status, String statusName,
            String declarationNo, String blNo,
            LocalDate shippedDate, LocalDate paidDate,
            String remark, String createdBy,
            /*
             * 원본 Invoice / Packing List(C000652) 조건 [기타]의 <b>[수정일자순(정렬)]</b> 이
             * 쓰는 축(2026-09-02 실측). BaseTimeEntity 가 이미 들고 있는 값이라 싣기만 하면 된다 —
             * 프로젝트계획·매출계획·오더관리에 이어 네 번째 같은 자리다.
             */
            java.time.LocalDateTime updatedAt,
            List<ExportLineResponse> lines,
            LocalDate voucherDate, String lcNo, LocalDate lcDate, String lcBank, String shipper, String messrs,
            String notifyParty, String portOfLoading, String carrier, LocalDate sailingDate, String weightUnit,
            boolean confirmed
    ) {
        public static ExportResponse from(ExportOrder e) {
            return new ExportResponse(
                    e.getId(), e.getInvoiceNo(), e.getInvoiceDate(),
                    e.getBuyer().getId(), e.getBuyer().getName(),
                    e.getCurrency().getId(), e.getCurrency().getCode(), e.getCurrency().getSymbol(),
                    e.getForeignAmount(), e.getAppliedRate(), e.getKrwAmount(),
                    e.getIncoterms(), e.getDestination(),
                    e.getStatus(), e.getStatus().getDisplayName(),
                    e.getDeclarationNo(), e.getBlNo(),
                    e.getShippedDate(), e.getPaidDate(),
                    e.getRemark(), e.getCreatedBy(),
                    e.getUpdatedAt(),
                    e.getLines().stream().map(ExportLineResponse::from).toList(),
                    e.getVoucherDate(), e.getLcNo(), e.getLcDate(), e.getLcBank(), e.getShipper(), e.getMessrs(),
                    e.getNotifyParty(), e.getPortOfLoading(), e.getCarrier(), e.getSailingDate(), e.getWeightUnit(),
                    e.isConfirmed());
        }
    }

    /** 수출현황 요약: 진행 중 외화·원화 잔액과 미입금 */
    public record ExportSummary(
            BigDecimal totalKrw,
            BigDecimal unpaidKrw,
            long orderCount,
            long shippingCount,
            long unpaidCount,
            List<ExportResponse> exports
    ) {}
}
