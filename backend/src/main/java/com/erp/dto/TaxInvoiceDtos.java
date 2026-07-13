package com.erp.dto;

import com.erp.domain.TaxInvoice;
import com.erp.domain.TaxInvoiceStatus;
import com.erp.domain.TaxInvoiceType;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class TaxInvoiceDtos {

    private TaxInvoiceDtos() {}

    /** 판매/구매 전표에서 세금계산서 발행 */
    public record IssueRequest(
            @NotNull(message = "전표 종류를 지정하세요.") TaxInvoiceType type,
            @NotNull(message = "근거 전표 id를 지정하세요.") Long sourceId,
            LocalDate issueDate,
            String remark
    ) {}

    public record TaxInvoiceResponse(
            Long id, String invoiceNo,
            TaxInvoiceType invoiceType, String invoiceTypeName,
            TaxInvoiceStatus status, String statusName,
            LocalDate issueDate,
            Long partnerId, String partnerName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String sourceDocNo, String remark, String createdBy
    ) {
        public static TaxInvoiceResponse from(TaxInvoice t) {
            return new TaxInvoiceResponse(
                    t.getId(), t.getInvoiceNo(),
                    t.getInvoiceType(), t.getInvoiceType().getDisplayName(),
                    t.getStatus(), t.getStatus().getDisplayName(),
                    t.getIssueDate(),
                    t.getPartner().getId(), t.getPartner().getName(),
                    t.getSupplyAmount(), t.getVatAmount(), t.getTotalAmount(),
                    t.getSourceDocNo(), t.getRemark(), t.getCreatedBy());
        }
    }
}
