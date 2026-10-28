package com.erp.accounting.reflection.dto;

import com.erp.trade.purchase.Purchase;
import com.erp.trade.sales.Sales;
import com.erp.trade.settlement.Settlement;
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
            /** 품목 조건이 id 로 거른다 — 이름이 같고 규격만 다른 품목이 정상이다. */
            Long itemId,
            String itemCode, String itemName,
            /**
             * 규격 · 품목구분 · 근거 전표번호 — 2026-09-08 원본 회계미반영현황(판매)
             * (E040609)의 접힌 줄까지 재니 [규격]·[품목구분]·[오더관리번호]가 조건으로 있다.
             * 셋 다 품목 마스터와 전표 줄이 진작 들고 있는 값인데 응답이 안 실어
             * 화면이 거를 수가 없었다.
             */
            String spec, String itemCategoryName, String sourceDocNo,
            BigDecimal quantity, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount,
            String remark,
            /** 판매 줄 id · 이 줄이 이미 회계반영됐는지(판매일괄회계반영 [일부반영] 이 줄마다 고른다). 구매 · 결제 줄은 null · false. */
            Long lineId, boolean reflected
    ) {
        public SlipLine(Long itemId, String itemCode, String itemName, String spec, String itemCategoryName, String sourceDocNo,
                        BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount, String remark) {
            this(itemId, itemCode, itemName, spec, itemCategoryName, sourceDocNo, quantity, unitPrice, supplyAmount, vatAmount, remark, null, false);
        }
    }

    public record SlipResponse(
            Long id,
            SlipKind kind,
            String docNo,
            LocalDate slipDate,
            Long partnerId,
            String partnerName,
            /** 창고 조건이 id 로 거른다 — 창고명은 유일하지 않다. */
            Long warehouseId,
            String warehouseName,
            /** 프로젝트 조건이 id 로 거른다 — 이름은 겹칠 수 있다. */
            Long projectId,
            String projectName,
            /** 전표를 친 사람. 원본 조건 판의 [담당자]. */
            String employeeName,
            /**
             * 거래처에 붙은 관리담당자. 원본 조건 판의 [거래처관리담당자] — [담당자]와 다르다.
             * 없으면 "이 담당자가 맡은 거래처의 미반영 전표" 를 뽑을 수가 없다.
             */
            String partnerManager,
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
            /**
             * 전표를 만든 <b>시각</b>. 원본 결제내역조회의 첫 열이 [결제요청일시] 라
             * 날짜만으로는 그 이름을 지킬 수 없다 — 같은 날 여러 건이면 순서도 안 보인다.
             */
            java.time.LocalDateTime createdAt,
            /** 전표 적요. 원본 격자의 [내역]·[적요]. */
            String note,
            /** 품목 줄. 원본 회계미반영현황의 결과 격자가 이 단위다. */
            List<SlipLine> lines
    ) {
        /** 반영된 줄에 분개를 붙인다. 목록을 만든 뒤 한 번에 채운다(N+1 방지). */
        public SlipResponse withJournal(Long entryId, String docNo) {
            return new SlipResponse(id, kind, this.docNo, slipDate, partnerId, partnerName,
                    warehouseId, warehouseName, projectId, projectName, employeeName, partnerManager, itemSummary,
                    supplyAmount, vatAmount, totalAmount, vatType, tradeKind, reflected,
                    entryId, docNo, createdBy, createdAt, note, lines);
        }
        public static SlipResponse fromSales(Sales s) {
            return new SlipResponse(
                    s.getId(), SlipKind.SALES, s.getDocNo(), s.getSaleDate(),
                    s.getPartner() != null ? s.getPartner().getId() : null, s.getPartner() != null ? s.getPartner().getName() : null,
                    s.getWarehouse() != null ? s.getWarehouse().getId() : null,
                    s.getWarehouse() != null ? s.getWarehouse().getName() : null,
                    s.getProject() != null ? s.getProject().getId() : null,
                    s.getProject() != null ? s.getProject().getName() : null,
                    s.getEmployee() != null ? s.getEmployee().getName() : null,
                    s.getPartner() != null ? s.getPartner().getManager() : null,
                    summarize(s.getLines().stream().map(l -> l.effectiveItemName()).toList()),
                    s.getSupplyAmount(), s.getVatAmount(), s.getTotalAmount(),
                    s.isTaxable() ? "과세" : "면세",
                    s.isReturnSlip() ? "반품" : "일반",
                    s.isAccountingReflected(),
                    null, null, s.getCreatedBy(), s.getCreatedAt(), s.getRemark(),
                    s.getLines().stream().map(l -> new SlipLine(
                            l.getItem().getId(), l.getItem().getCode(), l.effectiveItemName(),
                            l.effectiveSpec(),
                            l.getItem().getCategory() != null ? l.getItem().getCategory().getDisplayName() : null,
                            l.getSourceOrder() != null ? l.getSourceOrder().getOrderNo() : null,
                            l.getQuantity(), l.getUnitPrice(),
                            l.getSupplyAmount(), l.getVatAmount(), l.getRemark(), l.getId(), l.isAccountingReflected())).toList());
        }

        /**
         * 일부 줄만 반영된 판매의 <b>아직 안 된 줄</b>만 남긴 모습 — 판매일괄회계반영은 그 줄들의 금액으로 보여 준다
         * (원본 2026-10-22 재기: 3줄 중 한 줄을 반영하면 거래처 줄이 남은 금액 · 남은 품목요약으로 바뀐다).
         * 반영된 줄이 없으면 그대로.
         */
        public SlipResponse onlyUnreflectedLines() {
            if (lines == null || lines.stream().noneMatch(SlipLine::reflected)) return this;
            List<SlipLine> rest = lines.stream().filter(l -> !l.reflected()).toList();
            BigDecimal sup = rest.stream().map(SlipLine::supplyAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal vat = rest.stream().map(SlipLine::vatAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            return new SlipResponse(id, kind, docNo, slipDate, partnerId, partnerName,
                    warehouseId, warehouseName, projectId, projectName, employeeName, partnerManager,
                    summarize(rest.stream().map(SlipLine::itemName).toList()),
                    sup, vat, sup.add(vat), vatType, tradeKind, reflected,
                    journalEntryId, journalDocNo, createdBy, createdAt, note, rest);
        }

        public static SlipResponse fromPurchase(Purchase p) {
            return new SlipResponse(
                    p.getId(), SlipKind.PURCHASE, p.getDocNo(), p.getPurchaseDate(),
                    p.getPartner() != null ? p.getPartner().getId() : null,
                    p.getPartner() != null ? p.getPartner().getName() : null,
                    p.getWarehouse() != null ? p.getWarehouse().getId() : null,
                    p.getWarehouse() != null ? p.getWarehouse().getName() : null,
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getPartner() != null ? p.getPartner().getManager() : null,
                    summarize(p.getLines().stream().map(l -> l.effectiveItemName()).toList()),
                    p.getSupplyAmount(), p.getVatAmount(), p.getTotalAmount(),
                    p.isTaxable() ? "과세" : "면세",
                    p.isReturnSlip() ? "반품" : "일반",
                    p.isAccountingReflected(),
                    null, null, p.getCreatedBy(), p.getCreatedAt(), p.getRemark(),
                    p.getLines().stream().map(l -> new SlipLine(
                            l.getItem().getId(), l.getItem().getCode(), l.effectiveItemName(),
                            l.effectiveSpec(),
                            l.getItem().getCategory() != null ? l.getItem().getCategory().getDisplayName() : null,
                            l.getSourceOrder() != null ? l.getSourceOrder().getOrderNo() : null,
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
                    null, null,
                    st.getProject() != null ? st.getProject().getId() : null,
                    st.getProject() != null ? st.getProject().getName() : null,
                    null,
                    st.getPartner().getManager(),
                    st.getMethod() != null ? st.getMethod() : "",
                    java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO, st.getAmount(),
                    st.getType().getDisplayName(),
                    "일반",   // 결제에는 반품이 없다
                    st.isAccountingReflected(),
                    null, null, st.getCreatedBy(), st.getCreatedAt(), st.getNote(),
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
            @NotEmpty(message = "반영할 전표를 선택하세요.") List<Long> ids,
            /**
             * 전표 id → 고른 [부가세유형](선택). 원본 판매 · 구매일괄회계반영 격자의 부가세유형 칸은 고르기다
             * (2026-10-13 loginaa 판매: 세금계산서 · 영세율 · 계산서 · 소매매출 · 수출 · 카드매출 · 계산서(고정자산) ·
             * 세.계(고정자산) · 소매(면세) · 카드매출(면세) · 현금영수증(면세) · 현금영수증 · 매입자발행세금계산서 · 영세율(기타) · 기타매출).
             * 고른 값이 분개의 부가세유형으로 그대로 들어간다. 없으면 과세 → 세금계산서, 면세 → 계산서.
             */
            java.util.Map<Long, @jakarta.validation.constraints.Size(max = 30, message = "부가세유형은 30자까지입니다.") String> vatTypes,
            /**
             * 전표 id → [조정] 금액(선택, 판매만). 원본 판매일괄회계반영(E040215, 2026-10-22 loginaa 실측): 격자 [조정] 칸에 100 을 넣으면
             * 공급가액 = 거래가액 − 조정(10,000 → 9,900), 부가세 = 공급가액의 10%(990), 합계 10,890 이 되고
             * [매출전표 I] 로 만든 분개가 외상매출금 10,890 / 제품매출 9,900 · 부가세예수금 990 이다(판매전표는 그대로 11,000).
             */
            java.util.Map<Long, BigDecimal> adjustments
    ) {
        /** 예전 호출(조정 없음). */
        public ReflectRequest(SlipKind kind, List<Long> ids, java.util.Map<Long, String> vatTypes) {
            this(kind, ids, vatTypes, null);
        }
    }

    /**
     * 판매일괄회계반영 [매출전표 I] 창 [저장(F8)] — 고른 판매(또는 판매 줄)를 <b>회계전표 한 장</b>으로 묶는다
     * (원본 2026-10-22 2차 재기: 같은 거래처 두 판매 18,000 · 1,800 · 19,800 → 전표 1장).
     * 창에서 고친 값(일자 · 부서 · 프로젝트 · 거래처 · 적요 · 부가세유형 · 공급가액)이 분개로 간다.
     * 공급가액을 고치면 부가세는 10% 로 다시 매기고, 판매 쪽과의 차이가 채권의 기타할인등차액이 된다.
     */
    public record SalesBatchRequest(
            @NotEmpty(message = "반영할 전표를 선택하세요.") List<Long> salesIds,
            /** 비우면 그 판매의 아직 안 된 줄 전부. 주면 이 줄들만(일부반영). */
            List<Long> lineIds,
            LocalDate entryDate,
            Long departmentId,
            Long projectId,
            Long partnerId,
            @jakarta.validation.constraints.Size(max = 200, message = "적요는 200자까지입니다.") String note,
            @jakarta.validation.constraints.Size(max = 30, message = "부가세유형은 30자까지입니다.") String vatType,
            /** 창에서 고친 공급가액. 비우면 판매 금액 그대로. */
            BigDecimal supplyAmount
    ) {}

    public record SalesBatchResult(Long journalEntryId, String journalDocNo, int salesCount, int lineCount) {}

    public record ReflectResult(int reflectedCount) {}
}
