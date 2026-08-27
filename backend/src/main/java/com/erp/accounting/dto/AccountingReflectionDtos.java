package com.erp.accounting.dto;

import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;
import com.erp.trade.domain.Settlement;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 판매/구매 전표의 회계반영/미반영 현황 및 일괄반영 DTO */
public final class AccountingReflectionDtos {

    private AccountingReflectionDtos() {}

    /**
     * SETTLEMENT 는 결제내역조회(수금·지급)다. 회계미반영현황 화면은 원본과 같이
     * 판매·구매만 고르게 두고, 결제는 자기 화면에서 이 경로로 반영한다.
     */
    public enum SlipKind { SALES, PURCHASE, SETTLEMENT }

    /**
     * 미반영 전표 한 줄.
     *
     * <p>원본 회계미반영현황은 창고·프로젝트·품목·거래처관리담당자로도 거른다.
     * 그 값들은 전표에 이미 있는데 응답에 안 실어서 화면이 거를 수가 없었다 — 같이 보낸다.
     * 품목은 전표에 여러 줄이라 "첫 품목 외 N건" 으로 줄여 보낸다(원본 격자의 '품목명(요약)').
     */
    /**
     * 미반영 전표의 <b>라인 한 줄</b>.
     *
     * <p>원본 회계미반영현황(판매)의 결과는 전표가 아니라 <b>품목 줄</b>이다 —
     * 일자-No. · 거래처명 · 품목코드 · 품목명 · 수량 · 단가 · 공급가액 · 부가세 · 적요.
     * 요약("첫 품목 외 N건")만으로는 <b>어느 품목이 회계로 안 넘어갔는지</b> 알 수 없다.
     */
    public record SlipLine(
            String itemCode, String itemName,
            BigDecimal quantity, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount,
            String remark
    ) {}

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
            /** 원본 판매·구매일괄회계반영의 [부가세유형] — 과세 · 면세. */
            String vatType,
            /**
             * 원본 판매일괄회계반영의 [거래구분] · 구매일괄회계반영의 [구매구분] — 일반 · 반품.
             * 반품 전표는 금액이 음수라 반영 금액도 반대로 간다.
             */
            String tradeKind,
            boolean reflected,
            /**
             * 원본 판매·구매일괄회계반영의 [회계전표No.]. 반영 전에는 null 이다.
             * 반영했다는 표시만 있고 어느 분개가 됐는지가 없으면 찾아갈 길이 없다.
             */
            Long journalEntryId,
            String journalDocNo,
            /** 전표를 만든 사람. 원본 결제내역조회의 [결제요청자ID]. */
            String createdBy,
            /** 전표 적요. 원본 격자의 [내역]·[적요]. */
            String note,
            /** 품목 줄. 원본 회계미반영현황의 결과 격자가 이 단위다. */
            List<SlipLine> lines
    ) {
        /** 반영된 줄에 분개를 붙인다. 목록을 만든 뒤 한 번에 채운다(N+1 방지). */
        public SlipResponse withJournal(Long entryId, String docNo) {
            return new SlipResponse(id, kind, this.docNo, slipDate, partnerId, partnerName,
                    warehouseName, projectName, employeeName, itemSummary,
                    supplyAmount, vatAmount, totalAmount, vatType, tradeKind, reflected,
                    entryId, docNo, createdBy, note, lines);
        }
        public static SlipResponse fromSales(Sales s) {
            return new SlipResponse(
                    s.getId(), SlipKind.SALES, s.getDocNo(), s.getSaleDate(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    s.getWarehouse() != null ? s.getWarehouse().getName() : null,
                    s.getProject() != null ? s.getProject().getName() : null,
                    s.getEmployee() != null ? s.getEmployee().getName() : null,
                    summarize(s.getLines().stream().map(l -> l.getItem().getName()).toList()),
                    s.getSupplyAmount(), s.getVatAmount(), s.getTotalAmount(),
                    s.isTaxable() ? "과세" : "면세",
                    s.isReturnSlip() ? "반품" : "일반",
                    s.isAccountingReflected(),
                    null, null, s.getCreatedBy(), s.getRemark(),
                    s.getLines().stream().map(l -> new SlipLine(
                            l.getItem().getCode(), l.getItem().getName(),
                            l.getQuantity(), l.getUnitPrice(),
                            l.getSupplyAmount(), l.getVatAmount(), l.getRemark())).toList());
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
                    p.isTaxable() ? "과세" : "면세",
                    p.isReturnSlip() ? "반품" : "일반",
                    p.isAccountingReflected(),
                    null, null, p.getCreatedBy(), p.getRemark(),
                    p.getLines().stream().map(l -> new SlipLine(
                            l.getItem().getCode(), l.getItem().getName(),
                            l.getQuantity(), l.getUnitPrice(),
                            l.getSupplyAmount(), l.getVatAmount(), l.getRemark())).toList());
        }

        /**
         * 결제(수금·지급) 한 줄. 원본 결제내역조회의 격자다.
         *
         * <p>결제에는 품목이 없다 — 품목요약 자리에는 [결제방법]을 넣는다.
         * 공급가액·부가세도 없어 결제금액을 합계에만 싣고 나머지는 0 이다.
         * 지어낸 값을 넣는 것보다 0 이 낫다.
         */
        public static SlipResponse fromSettlement(Settlement st) {
            return new SlipResponse(
                    st.getId(), SlipKind.SETTLEMENT, st.getDocNo(), st.getSettleDate(),
                    st.getPartner().getId(), st.getPartner().getName(),
                    null, st.getProject() != null ? st.getProject().getName() : null,
                    null,
                    st.getMethod() != null ? st.getMethod() : "",
                    java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO, st.getAmount(),
                    st.getType().getDisplayName(),
                    "일반",   // 결제에는 반품이 없다
                    st.isAccountingReflected(),
                    null, null, st.getCreatedBy(), st.getNote(),
                    List.of());
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
