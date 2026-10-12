package com.erp.inventory.lot.dto;

import com.erp.inventory.lot.Lot;
import com.erp.inventory.lot.LotTransaction;
import com.erp.inventory.lot.LotStatus;
import com.erp.inventory.lot.LotTxType;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.List;
import java.time.LocalDate;

public final class LotDtos {

    private LotDtos() {}

    /** 로트 실사 조정 요청. 실사수량으로 로트 재고를 맞춘다. */
    public record AdjustLotRequest(
            @PositiveOrZero(message = "실사수량은 0 이상이어야 합니다.")
            @NotNull(message = "실사수량을 입력하세요.") BigDecimal actualQty,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String note
    ) {}

    /** 로트 수불부/내역 한 줄. balanceAfter 는 그 시점 로트 재고. */
    public record LotTransactionResponse(
            Long id, Long lotId, String lotNo,
            Long itemId, String itemCode, String itemName, String unit,
            /*
             * 원본 시리얼/로트No.재고수불부(E040620) 조건의 <b>[창고]</b>(2026-09-01 실측).
             * 로트는 창고를 물고 있는데 수불부 응답에 안 실어, 어느 창고에서 오간 로트인지
             * <b>보이지도 걸리지도</b> 않았다. 창고를 안 정한 로트는 null 이다.
             */
            Long warehouseId, String warehouseName,
            /*
             * 원본 시리얼/로트No.내역현황(E040639) 조건의 <b>[유효기한]</b> — 거기서는
             * <b>구간</b>이다(2026-09-01 실측: ====/==/ ~ ====/==/ 두 칸).
             * 로트가 들고 있는 값인데 내역 응답에 없어 그 축으로 거를 수가 없었다.
             */
            LocalDate expireDate,
            /*
             * 원본 수불부(E040620) [기타]의 <b>[사용중단시리얼/로트포함]</b> 이 쓰는 축.
             * 우리 로트의 '사용중단' 은 <b>보류(held)</b> 다. 내역 응답에 없어 그 로트를
             * 넣을지 뺄지를 화면이 가릴 수가 없었다.
             */
            boolean held,
            LocalDate txDate, LotTxType type, String typeName,
            BigDecimal quantityChange, BigDecimal balanceAfter,
            String note, String createdBy,
            /* 원본 [전표구분] · [연결전표-No.] — 전표가 남긴 줄이면 '구매' · 'PO-…', 직접 남긴 줄이면 null. */
            String docType, Long sourceId, String sourceNo, String partnerName,
            /* [신규(F2)] 내역입력으로 손으로 넣은 줄과 그 창의 칸 — 그 줄만 목록에서 열어 고치고 [선택삭제] 로 지운다. */
            boolean manual, Long txWarehouseId, String txWarehouseName, Long projectId, String projectName,
            String chargeName, String mgmtName
    ) {
        public static LotTransactionResponse from(LotTransaction t) {
            Lot l = t.getLot();
            return new LotTransactionResponse(
                    t.getId(), l.getId(), l.getLotNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getWarehouse() != null ? l.getWarehouse().getId() : null,
                    l.getWarehouse() != null ? l.getWarehouse().getName() : null,
                    l.getExpireDate(),
                    l.isHeld(),
                    t.getTxDate(), t.getType(), t.getType().getDisplayName(),
                    t.getQuantityChange(), t.getBalanceAfter(),
                    t.getNote(), t.getCreatedBy(),
                    t.getDocType(), t.getSourceId(), t.getSourceNo(), t.getPartnerName(),
                    t.isManual(),
                    t.getWarehouse() != null ? t.getWarehouse().getId() : null,
                    t.getWarehouse() != null ? t.getWarehouse().getName() : null,
                    t.getProject() != null ? t.getProject().getId() : null,
                    t.getProject() != null ? t.getProject().getName() : null,
                    t.getChargeName(), t.getMgmtName());
        }
    }

    public record CreateLotRequest(
            @Size(max = 50, message = "로트No.은(는) 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "로트No.를 입력하세요.") String lotNo,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            Long warehouseId,
            LocalDate inboundDate,
            LocalDate expireDate,
            @NotNull(message = "입고수량을 입력하세요.") @Positive(message = "입고수량은 0보다 커야 합니다.") BigDecimal inboundQty
    ) {}

    /**
     * 원본 '시리얼/로트No.내역입력' 창(2026-10-12 실측). 빈 칸으로 저장하면 [창고 · 품목코드 · 수량 · 시리얼/로트No.] 네 칸이
     * 빨개진다 — 그 넷이 필수다. 시리얼/로트No. 는 코드도움(등록된 로트)에서 고른다.
     */
    public record ManualTxRequest(
            LocalDate txDate,
            @NotBlank(message = "전표구분을 선택하세요.") @Size(max = 30, message = "전표구분은 30자까지 넣을 수 있습니다.") String docType,
            @NotNull(message = "창고를 입력하세요.") Long warehouseId,
            @NotNull(message = "품목코드를 입력하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotBlank(message = "시리얼/로트No.를 입력하세요.") @Size(max = 50, message = "시리얼/로트No.은(는) 50자까지 넣을 수 있습니다.") String lotNo,
            @Size(max = 100, message = "거래처는 100자까지 넣을 수 있습니다.") String partnerName,
            @Size(max = 100, message = "관리항목은 100자까지 넣을 수 있습니다.") String mgmtName,
            @Size(max = 50, message = "담당자는 50자까지 넣을 수 있습니다.") String chargeName,
            Long projectId,
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.") String note
    ) {}

    public record DeleteTxRequest(@NotEmpty(message = "리스트에 선택된 자료가 없습니다.") List<Long> ids) {}

    public record ConsumeLotRequest(
            @NotNull(message = "출고수량을 입력하세요.") @Positive(message = "출고수량은 0보다 커야 합니다.") BigDecimal qty
    ) {}

    public record HoldLotRequest(
            boolean held
    ) {}

    public record LotResponse(
            Long id, String lotNo,
            Long itemId, String itemCode, String itemName, String unit,
            /** 규격. 원본 시리얼/로트No.등록의 열이 [품목명[규격]]·[규격] 이다. */
            String spec,
            Long warehouseId, String warehouseName,
            LocalDate inboundDate, LocalDate expireDate,
            BigDecimal inboundQty, BigDecimal stockQty,
            boolean held, LotStatus status, String statusName
    ) {
        /**
         * 기준일자 시점의 잔량으로 바꿔 준다. <b>상태도 같이 다시 낸다</b> —
         * 그때는 남아 있던 로트를 '소진' 이라고 적으면 표가 거짓말을 한다.
         */
        public LotResponse withStockQty(BigDecimal qty) {
            LotStatus s = LotStatus.of(held, qty);
            return new LotResponse(id, lotNo, itemId, itemCode, itemName, unit, spec,
                    warehouseId, warehouseName, inboundDate, expireDate, inboundQty, qty,
                    held, s, s.getDisplayName());
        }

        public static LotResponse from(Lot l) {
            // 상태는 저장하지 않는다. 보유수량·보류 플래그에서 파생한다(LotStatus 참조).
            LotStatus status = LotStatus.of(l.isHeld(), l.getStockQty());
            return new LotResponse(
                    l.getId(), l.getLotNo(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(),
                    l.getItem().getSpec(),
                    l.getWarehouse() != null ? l.getWarehouse().getId() : null,
                    l.getWarehouse() != null ? l.getWarehouse().getName() : null,
                    l.getInboundDate(), l.getExpireDate(),
                    l.getInboundQty(), l.getStockQty(),
                    l.isHeld(), status, status.getDisplayName());
        }
    }
}
