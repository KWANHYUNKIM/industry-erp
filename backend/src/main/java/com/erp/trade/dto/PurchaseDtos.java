package com.erp.trade.dto;

import com.erp.inventory.domain.ItemCategory;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.PurchaseLine;
import com.erp.trade.domain.PurchaseOrder;
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

public final class PurchaseDtos {

    private PurchaseDtos() {}

    public record PurchaseLineRequest(
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
            /** 이 줄을 담아 온 근거전표(발주서) id. 직접 입력한 줄은 null. */
            Long sourceOrderId
    ) {}

    public record CreatePurchaseRequest(
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            LocalDate purchaseDate,
            Boolean taxable,
            /**
             * 원본 [구매구분] — 일반(false) · 반품(true). 안 주면 일반.
             * 반품이면 서버가 수량·금액을 음수로 뒤집어 저장한다. 화면은 양수로 적는다.
             */
            Boolean returnSlip,
            @Size(max = 500, message = "비고는 500자까지 넣을 수 있습니다.")
            String remark,
            /** 귀속 프로젝트 (선택) */
            Long projectId,
            /** 담당 사원 (선택). 실적이 붙을 사람이다. */
            Long employeeId,
            /** 거래별부가세계산 — 전표 합계에 한 번 반올림한다. 비우면 라인별 반올림(기존 동작). */
            Boolean vatBySlip,
            @NotEmpty(message = "품목을 1개 이상 입력하세요.") @Valid List<PurchaseLineRequest> lines
    ) {}

    public record PurchaseLineResponse(
            /**
             * 라인 id. 수주는 예전부터 주는데 판매·구매만 빠져 있었다 —
             * 라인을 지목할 키가 없으면 라인 단위로 아무것도 붙일 수 없다
             * (원본 판매입력II 그리드의 추가항목 열이 그런 것이다).
             */
            Long lineId,
            Long itemId, String itemCode, String itemName, String unit, String spec,
            /** 원본 전표이력조회(거래이력조회) 조건의 <b>[품목구분]</b>. 품목 마스터의 값이다. */
            ItemCategory itemCategory, String itemCategoryName,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            String remark, String lotNo, BigDecimal extraCost,
            /** 불러온 전표 — 원본 그리드의 [불러온 전표 / 전표일자 / 전표No.] 3열. 없으면 전부 null. */
            Long sourceOrderId, String sourceDocType, LocalDate sourceDocDate, String sourceDocNo
    ) {
        static PurchaseLineResponse from(PurchaseLine l) {
            PurchaseOrder src = l.getSourceOrder();
            return new PurchaseLineResponse(
                    l.getId(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getUnit(), l.getItem().getSpec(),
                    l.getItem().getCategory(),
                    l.getItem().getCategory() != null ? l.getItem().getCategory().getDisplayName() : null,
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    l.getRemark(), l.getLotNo(), l.getExtraCost(),
                    src == null ? null : src.getId(),
                    src == null ? null : "발주서",
                    src == null ? null : src.getOrderDate(),
                    src == null ? null : src.getOrderNo());
        }
    }

    /** 구매/외주 할인현황 라인 행 (품목 기준단가 대비 실매입단가 할인) */
    /**
     * 할인 한 줄.
     *
     * <p>원본 할인현황의 조건 판은 창고·프로젝트·거래처관리담당자로도 거른다.
     * 그 값들은 전표에 이미 있는데 응답에 안 실어서 화면이 거를 수가 없었다 — 같이 보낸다.
     */
    public record PurchaseDiscountRow(
            LocalDate date, String docNo, String partnerName, String itemCode, String itemName,
            String warehouseName, String projectName, String employeeName,
            /**
             * 원본 할인현황 조건의 <b>[거래유형]</b> — 과세 · 면세.
             * 전표에 저장된 과세 여부를 그대로 옮긴다. 예전에는 부가세가 0 인지로 되짚어야 해서
             * <b>반올림으로 0 이 된 과세 전표가 면세로 섞였다.</b>
             */
            String taxTypeName,
            BigDecimal qty, BigDecimal basePrice, BigDecimal buyPrice,
            BigDecimal discountPerUnit, BigDecimal discountAmount, BigDecimal discountRate
    ) {}

    /**
     * 품목의 <b>마지막 입고단가</b> 한 줄.
     *
     * <p>재고금액을 내는 화면 여섯이 이 값 하나를 얻으려고 구매 전표를 통째로 받고 있었다
     * (2026-09-10 실측 984KB). 품목당 한 줄이면 그만이다.
     *
     * <p><b>같은 날 전표가 둘이면 나중에 적은 것이 마지막 입고다.</b> 여태 화면이 쓰던 규칙은
     * 그렇지 않았다 — 목록이 날짜 내림차순으로 오는 데 기대어 <code>&gt;=</code> 로 덮어써서,
     * 같은 날짜에서는 <b>id 가 작은(먼저 적은) 전표</b>가 이겼다. 아무도 그렇게 정한 적이 없고
     * 목록 차례가 바뀌면 값도 조용히 바뀌는 규칙이었다. 지금 자료에서 그 차이로 값이 갈리는
     * 품목이 <b>하나</b> 있다(2026-07-15 에 1,200 과 1 두 건).
     */
    public record ItemPriceResponse(Long itemId, BigDecimal unitPrice) {}

    public record PurchaseResponse(
            Long id, String docNo,
            Long partnerId, String partnerName,
            Long warehouseId, String warehouseName,
            LocalDate purchaseDate,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String remark, String createdBy,
            /** 부가세를 전표 단위로 계산한 전표인가 (거래별부가세계산) */
            boolean vatBySlip,
            /** 과세 전표인가. 원본 일괄회계반영의 [부가세유형] (과세 · 면세). */
            boolean taxable,
            /** 원본 [거래구분]이 반품인가. 수량·금액이 음수로 저장돼 있다. */
            boolean returnSlip,
            /** 원본 [거래구분] 표시값 — 일반 · 반품. */
            String tradeKindName,
            /**
             * 회계반영 여부. 엔티티에는 있었는데 응답에 빠져 있어서 구매조회가 이 열을 못 그렸다
             * (판매는 SalesResponse 가 이미 주고 있다 — 두 쪽이 어긋나 있었다).
             */
            boolean accountingReflected,
            Long projectId, String projectName,
            /**
             * 원본 판매조회·구매조회 조건 판 [기타]의 <b>[수정일자순(정렬)]</b> 이 쓰는 축.
             * 그 축이 응답에 없어 정렬을 만들 수 없었다. BaseTimeEntity 가 이미 들고 있는
             * 값이라 싣기만 하면 된다(매출계획조회 ComparisonRow.updatedAt 과 같은 자리다).
             */
            LocalDateTime updatedAt,
            /**
             * 원본 조건 [최초작성일자]. 예외에 '<b>BaseTimeEntity 는 들지만 응답이 안 싣는다</b>'
             * 고 적어 두었던 값이다 — 맞는 말이었으므로 싣는다. 앞 바퀴에 [최종수정일시]를
             * 실으면서 이것만 두고 온 것인데, 원본은 둘을 나란히 묻는다.
             */
            LocalDateTime createdAt,
            Long employeeId, String employeeName,
            List<PurchaseLineResponse> lines
    ) {
        public static PurchaseResponse from(Purchase p) {
            return new PurchaseResponse(
                    p.getId(), p.getDocNo(),
                    p.getPartner().getId(), p.getPartner().getName(),
                    p.getWarehouse().getId(), p.getWarehouse().getName(),
                    p.getPurchaseDate(),
                    p.getSupplyAmount(), p.getVatAmount(), p.getTotalAmount(),
                    p.getRemark(), p.getCreatedBy(),
                    p.isVatBySlip(),
                    p.isTaxable(),
                    p.isReturnSlip(), p.isReturnSlip() ? "반품" : "일반",
                    p.isAccountingReflected(),
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getUpdatedAt(),
                    p.getCreatedAt(),
                    p.getEmployee() != null ? p.getEmployee().getId() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getLines().stream().map(PurchaseLineResponse::from).toList());
        }
    }
}
