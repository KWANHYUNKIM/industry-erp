package com.erp.dto;

import com.erp.domain.Purchase;
import com.erp.domain.Sales;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 판매/구매 전표의 회계반영/미반영 현황 및 일괄반영 DTO */
public final class AccountingReflectionDtos {

    private AccountingReflectionDtos() {}

    public enum SlipKind { SALES, PURCHASE }

    public record SlipResponse(
            Long id,
            SlipKind kind,
            String docNo,
            LocalDate slipDate,
            Long partnerId,
            String partnerName,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal totalAmount,
            boolean reflected
    ) {
        public static SlipResponse fromSales(Sales s) {
            return new SlipResponse(
                    s.getId(), SlipKind.SALES, s.getDocNo(), s.getSaleDate(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    s.getSupplyAmount(), s.getVatAmount(), s.getTotalAmount(),
                    s.isAccountingReflected());
        }

        public static SlipResponse fromPurchase(Purchase p) {
            return new SlipResponse(
                    p.getId(), SlipKind.PURCHASE, p.getDocNo(), p.getPurchaseDate(),
                    p.getPartner().getId(), p.getPartner().getName(),
                    p.getSupplyAmount(), p.getVatAmount(), p.getTotalAmount(),
                    p.isAccountingReflected());
        }
    }

    public record ReflectRequest(
            @NotNull(message = "구분(판매/구매)을 지정하세요.") SlipKind kind,
            @NotEmpty(message = "반영할 전표를 선택하세요.") List<Long> ids
    ) {}

    public record ReflectResult(int reflectedCount) {}
}
