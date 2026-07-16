package com.erp.trade.dto;

import com.erp.trade.domain.Quotation;
import com.erp.trade.domain.QuotationLine;
import com.erp.trade.domain.QuotationStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class QuotationDtos {

    private QuotationDtos() {}

    public record QuoteLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice
    ) {}

    public record CreateQuotationRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            LocalDate quoteDate,
            LocalDate validUntil,
            Boolean taxable,
            String remark,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<QuoteLineRequest> lines
    ) {}

    public record QuoteLineResponse(
            Long id, int lineNo,
            Long itemId, String itemCode, String itemName, String unit,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount
    ) {
        public static QuoteLineResponse from(QuotationLine l) {
            return new QuoteLineResponse(
                    l.getId(), l.getLineNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount());
        }
    }

    public record QuotationResponse(
            Long id, String quoteNo, LocalDate quoteDate, LocalDate validUntil,
            Long partnerId, String partnerName,
            QuotationStatus status, String statusName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            Long convertedOrderId, String remark, String createdBy,
            List<QuoteLineResponse> lines
    ) {
        public static QuotationResponse from(Quotation q) {
            return new QuotationResponse(
                    q.getId(), q.getQuoteNo(), q.getQuoteDate(), q.getValidUntil(),
                    q.getPartner().getId(), q.getPartner().getName(),
                    q.getStatus(), q.getStatus().getDisplayName(),
                    q.getSupplyAmount(), q.getVatAmount(), q.getTotalAmount(),
                    q.getConvertedOrderId(), q.getRemark(), q.getCreatedBy(),
                    q.getLines().stream().map(QuoteLineResponse::from).toList());
        }
    }
}
