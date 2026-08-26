package com.erp.accounting.dto;

import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 판매/구매 전표의 회계반영/미반영 현황 및 일괄반영 DTO */
public final class AccountingReflectionDtos {

    private AccountingReflectionDtos() {}

    public enum SlipKind { SALES, PURCHASE }

    /**
     * 미반영 전표 한 줄.
     *
     * <p>원본 회계미반영현황은 창고·프로젝트·품목·거래처관리담당자로도 거른다.
     * 그 값들은 전표에 이미 있는데 응답에 안 실어서 화면이 거를 수가 없었다 — 같이 보낸다.
     * 품목은 전표에 여러 줄이라 "첫 품목 외 N건" 으로 줄여 보낸다(원본 격자의 '품목명(요약)').
     */
    public record SlipResponse(
            Long id,
            SlipKind kind,
            String docNo,
            LocalDate slipDate,
            Long partnerId,
            String partnerName,
            String warehouseName,
            String projectName,
            String employeeName,
            String itemSummary,
            BigDecimal supplyAmount,
            BigDecimal vatAmount,
            BigDecimal totalAmount,
            boolean reflected
    ) {
        public static SlipResponse fromSales(Sales s) {
            return new SlipResponse(
                    s.getId(), SlipKind.SALES, s.getDocNo(), s.getSaleDate(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    s.getWarehouse() != null ? s.getWarehouse().getName() : null,
                    s.getProject() != null ? s.getProject().getName() : null,
                    s.getEmployee() != null ? s.getEmployee().getName() : null,
                    summarize(s.getLines().stream().map(l -> l.getItem().getName()).toList()),
                    s.getSupplyAmount(), s.getVatAmount(), s.getTotalAmount(),
                    s.isAccountingReflected());
        }

        public static SlipResponse fromPurchase(Purchase p) {
            return new SlipResponse(
                    p.getId(), SlipKind.PURCHASE, p.getDocNo(), p.getPurchaseDate(),
                    p.getPartner().getId(), p.getPartner().getName(),
                    p.getWarehouse() != null ? p.getWarehouse().getName() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    summarize(p.getLines().stream().map(l -> l.getItem().getName()).toList()),
                    p.getSupplyAmount(), p.getVatAmount(), p.getTotalAmount(),
                    p.isAccountingReflected());
        }

        /** "첫 품목 외 N건". 라인이 없으면 빈 문자열. */
        private static String summarize(List<String> names) {
            if (names.isEmpty()) return "";
            return names.size() == 1 ? names.get(0) : names.get(0) + " 외 " + (names.size() - 1) + "건";
        }
    }

    public record ReflectRequest(
            @NotNull(message = "구분(판매/구매)을 지정하세요.") SlipKind kind,
            @NotEmpty(message = "반영할 전표를 선택하세요.") List<Long> ids
    ) {}

    public record ReflectResult(int reflectedCount) {}
}
