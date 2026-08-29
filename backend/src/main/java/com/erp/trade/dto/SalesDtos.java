package com.erp.trade.dto;

import com.erp.trade.domain.Sales;
import com.erp.trade.domain.SalesConfirmStatus;
import com.erp.trade.domain.SalesLine;
import com.erp.trade.domain.SalesOrder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public final class SalesDtos {

    private SalesDtos() {}

    public record SalesLineRequest(
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.") @Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @NotNull(message = "단가를 입력하세요.") @Positive(message = "단가를 입력하세요.") BigDecimal unitPrice,
            @Size(max = 255, message = "비고는 255자까지 넣을 수 있습니다.")
            String remark,
            /** 시리얼/로트 번호 (선택) */
            @Size(max = 60, message = "입력한 글자가 너무 깁니다. 60자까지 넣을 수 있습니다.")
            String lotNo,
            /** 부대비용 (선택). 합계에는 더하지 않는다. */
            @PositiveOrZero(message = "부대비용은 0 이상이어야 합니다.")
            BigDecimal extraCost,
            /** 이 줄을 담아 온 근거전표(수주) id. 직접 입력한 줄은 null. */
            Long sourceOrderId
    ) {}

    public record CreateSalesRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            LocalDate saleDate,
            /** 과세 여부 (true=부가세 10%, false=면세) */
            Boolean taxable,
            /**
             * 원본 [거래구분] — 일반(false) · 반품(true). 안 주면 일반.
             * 반품이면 서버가 수량·금액을 음수로 뒤집어 저장한다. 화면은 양수로 적는다.
             */
            Boolean returnSlip,
            @Size(max = 500, message = "비고는 500자까지 넣을 수 있습니다.")
            String remark,
            /** 귀속 프로젝트 (선택). 프로젝트별 손익 집계의 재료가 된다. */
            Long projectId,
            /** 담당 사원 (선택). 입력 계정(createdBy)이 아니라 실적이 붙을 사람이다. */
            Long employeeId,
            /** 거래별부가세계산 — 전표 합계에 한 번 반올림한다. 비우면 라인별 반올림(기존 동작). */
            Boolean vatBySlip,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<SalesLineRequest> lines
    ) {}

    public record SalesLineResponse(
            /**
             * 라인 id. 수주는 예전부터 주는데 판매·구매만 빠져 있었다 —
             * 라인을 지목할 키가 없으면 라인 단위로 아무것도 붙일 수 없다
             * (원본 판매입력II 그리드의 추가항목 열이 그런 것이다).
             */
            Long lineId,
            Long itemId, String itemCode, String itemName, String unit, String spec,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            String remark, String lotNo, BigDecimal extraCost,
            /** 불러온 전표 — 원본 그리드의 [불러온 전표 / 전표일자 / 전표No.] 3열. 없으면 전부 null. */
            Long sourceOrderId, String sourceDocType, LocalDate sourceDocDate, String sourceDocNo
    ) {
        static SalesLineResponse from(SalesLine l) {
            SalesOrder src = l.getSourceOrder();
            return new SalesLineResponse(
                    l.getId(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(), l.getItem().getSpec(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    l.getRemark(), l.getLotNo(), l.getExtraCost(),
                    src == null ? null : src.getId(),
                    src == null ? null : "주문서",
                    src == null ? null : src.getOrderDate(),
                    src == null ? null : src.getOrderNo());
        }
    }

    /** 판매할인현황 라인 행 (품목 기준단가 대비 실판매단가 할인) */
    /**
     * 할인 한 줄.
     *
     * <p>원본 할인현황의 조건 판은 창고·프로젝트·거래처관리담당자로도 거른다.
     * 그 값들은 전표에 이미 있는데 응답에 안 실어서 화면이 거를 수가 없었다 — 같이 보낸다.
     */
    public record SalesDiscountRow(
            LocalDate date, String docNo, String partnerName, String itemCode, String itemName,
            String warehouseName, String projectName, String employeeName,
            /**
             * 원본 할인현황 조건의 <b>[거래유형]</b> — 과세 · 면세.
             * 전표에 저장된 과세 여부를 그대로 옮긴다. 예전에는 부가세가 0 인지로 되짚어야 해서
             * <b>반올림으로 0 이 된 과세 전표가 면세로 섞였다.</b>
             */
            String taxTypeName,
            BigDecimal qty, BigDecimal basePrice, BigDecimal salePrice,
            BigDecimal discountPerUnit, BigDecimal discountAmount, BigDecimal discountRate
    ) {}

    public record SalesResponse(
            Long id, String docNo,
            Long partnerId, String partnerName,
            Long warehouseId, String warehouseName,
            LocalDate saleDate,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String remark, String createdBy,
            SalesConfirmStatus confirmStatus, String confirmStatusName, LocalDateTime confirmedAt,
            boolean accountingReflected,
            /** 부가세를 전표 단위로 계산한 전표인가 (거래별부가세계산) */
            boolean vatBySlip,
            /** 과세 전표인가. 원본 일괄회계반영의 [부가세유형] (과세 · 면세). */
            boolean taxable,
            /** 원본 [거래구분]이 반품인가. 수량·금액이 음수로 저장돼 있다. */
            boolean returnSlip,
            /** 원본 [거래구분] 표시값 — 일반 · 반품. */
            String tradeKindName,
            Long projectId, String projectName,
            Long employeeId, String employeeName,
            List<SalesLineResponse> lines
    ) {
        public static SalesResponse from(Sales s) {
            return new SalesResponse(
                    s.getId(), s.getDocNo(),
                    s.getPartner().getId(), s.getPartner().getName(),
                    s.getWarehouse().getId(), s.getWarehouse().getName(),
                    s.getSaleDate(),
                    s.getSupplyAmount(), s.getVatAmount(), s.getTotalAmount(),
                    s.getRemark(), s.getCreatedBy(),
                    s.getConfirmStatus(), s.getConfirmStatus().getDisplayName(), s.getConfirmedAt(),
                    s.isAccountingReflected(),
                    s.isVatBySlip(),
                    s.isTaxable(),
                    s.isReturnSlip(), s.isReturnSlip() ? "반품" : "일반",
                    s.getProject() != null ? s.getProject().getId() : null,
                    s.getProject() != null ? s.getProject().getName() : null,
                    s.getEmployee() != null ? s.getEmployee().getId() : null,
                    s.getEmployee() != null ? s.getEmployee().getName() : null,
                    s.getLines().stream().map(SalesLineResponse::from).toList());
        }
    }
}
