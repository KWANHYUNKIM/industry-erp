package com.erp.dto;

import com.erp.domain.ExportOrder;
import com.erp.domain.ExportOrderLine;
import com.erp.domain.enums.ExportStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ExportDtos {

    private ExportDtos() {}

    public record ExportLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull @Positive(message = "외화 단가를 입력하세요.") BigDecimal unitPrice
    ) {}

    /** 수출 인보이스 발행. 원화 환산은 발행일 고시환율로 서버가 고정한다. */
    public record CreateExportRequest(
            @NotNull(message = "수입자를 선택하세요.") Long partnerId,
            @NotNull(message = "통화를 선택하세요.") Long currencyId,
            LocalDate invoiceDate,
            String incoterms,
            String destination,
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<ExportLineRequest> lines
    ) {}

    /** 통관진행: 수출신고번호를 받는다. */
    public record CustomsRequest(
            @NotNull(message = "수출신고번호를 입력하세요.") String declarationNo
    ) {}

    /** 선적완료: B/L 번호와 선적일. */
    public record ShipRequest(
            @NotNull(message = "B/L 번호를 입력하세요.") String blNo,
            LocalDate shippedDate
    ) {}

    /** 입금완료 */
    public record PayRequest(LocalDate paidDate) {}

    public record ExportLineResponse(
            Long id, int lineNo,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal amount
    ) {
        public static ExportLineResponse from(ExportOrderLine l) {
            return new ExportLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getQuantity(), l.getUnitPrice(), l.getAmount());
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
            List<ExportLineResponse> lines
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
                    e.getLines().stream().map(ExportLineResponse::from).toList());
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
