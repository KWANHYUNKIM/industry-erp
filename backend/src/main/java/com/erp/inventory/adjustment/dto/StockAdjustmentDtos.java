package com.erp.inventory.adjustment.dto;

import com.erp.inventory.item.ItemCategory;
import com.erp.inventory.adjustment.StockAdjustment;
import com.erp.inventory.adjustment.StockAdjustmentType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class StockAdjustmentDtos {

    private StockAdjustmentDtos() {}

    /**
     * 자가사용·불량처리는 quantity(차감할 수량)를, 재고조정은 actualQty(실사수량)를 채운다.
     * 재고조정의 변동량은 실사수량 - 현재고로 서버가 계산한다.
     */
    public record CreateAdjustmentRequest(
            @NotNull(message = "유형을 선택하세요.") StockAdjustmentType type,
            @NotNull(message = "품목을 선택하세요.") Long itemId,
            @NotNull(message = "창고를 선택하세요.") Long warehouseId,
            @PositiveOrZero(message = "수량은 0보다 작을 수 없습니다.") BigDecimal quantity,
            @PositiveOrZero(message = "실사수량은 0보다 작을 수 없습니다.") BigDecimal actualQty,
            LocalDate adjustDate,
            /* 원본 조건의 [프로젝트]·[담당자]. 맞출 때 안 정했을 수 있어 필수가 아니다. */
            Long projectId,
            Long employeeId,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String reason,
            /* 원본 [불량유형]·[사용유형](유형에 따라 이름이 다른 같은 자리)·[처리방법]. */
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String kind,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String handling
    ) {}

    public record AdjustmentResponse(
            Long id, String adjustNo, LocalDate adjustDate,
            StockAdjustmentType type, String typeName,
            Long itemId, String itemCode, String itemName, String unit,
            /** 원본 조건 <b>[규격]</b>. 품목은 이미 물고 오는데 이 칸만 안 실어 못 걸렀다. */
            String spec,
            /**
             * 원본 조건 <b>[품목구분]</b>. 다섯 현황 화면이 모두 이것으로 좁힌다 — 원자재가
             * 나간 것인지 제품이 나간 것인지는 <b>사유보다 먼저</b> 묻는 것이다.
             * 품목 마스터의 값이라 여기서는 실어 주기만 한다.
             */
            ItemCategory itemCategory, String itemCategoryName,
            Long warehouseId, String warehouseName,
            BigDecimal beforeQty, BigDecimal quantityChange, BigDecimal afterQty,
            Long projectId, String projectName, Long employeeId,
            String reason, String createdBy,
            /** 원본 [불량유형]·[사용유형]·[처리방법]. */
            String kind, String handling,
            /** 전표 안 줄 차례 — 같은 adjustNo 의 줄들이 한 장이다(자가사용입력). */
            Integer lineNo,
            /** 원본 머리 [거래처]. 이름은 화면이 거래처 목록에서 붙인다(inventory 는 trade 를 모른다). */
            Long partnerId,
            /**
             * 불량처리 전표의 <b>정상품목</b> 줄인가 — 재고가 <b>들어온</b> 줄이다(품목대체의 [정상품목] 격자,
             * 정상사용의 되돌아온 수량). 불량처리조회 · 불량처리현황 · 불량률은 이 줄을 빼고 센다.
             */
            boolean normal
    ) {
        public static AdjustmentResponse from(StockAdjustment a) {
            return new AdjustmentResponse(
                    a.getId(), a.getAdjustNo(), a.getAdjustDate(),
                    a.getType(), a.getType().getDisplayName(),
                    a.getItem().getId(), a.getItem().getCode(), a.getItem().getName(), a.getItem().getUnit(),
                    a.getItem().getSpec(),
                    a.getItem().getCategory(),
                    a.getItem().getCategory() != null ? a.getItem().getCategory().getDisplayName() : null,
                    a.getWarehouse().getId(), a.getWarehouse().getName(),
                    a.getBeforeQty(), a.getQuantityChange(), a.getAfterQty(),
                    a.getProject() != null ? a.getProject().getId() : null,
                    a.getProject() != null ? a.getProject().getName() : null,
                    a.getEmployeeId(),
                    a.getReason(), a.getCreatedBy(),
                    a.getKind(), a.getHandling(),
                    a.getLineNo(), a.getPartnerId(),
                    a.getType() == StockAdjustmentType.DEFECT && a.getQuantityChange().signum() > 0);
        }
    }

    /**
     * 원본 <b>자가사용입력</b>(E040503) 한 장 — 머리 [일자 · 거래처 · 담당자 · 창고 · 프로젝트] + 격자 [품목 · 수량 · 사용유형].
     *
     * <p>창고는 머리 한 칸이라 모든 줄이 같은 창고에서 나간다(원본 그대로). 수정할 때 일자는 막힌다 —
     * 원본 자가사용수정 창의 일자가 회색으로 잠긴다. 그래서 수정 요청의 date 는 무시한다.
     */
    public record SlipRequest(
            @NotNull(message = "유형을 선택하세요.") StockAdjustmentType type,
            LocalDate date,
            Long partnerId,
            Long employeeId,
            @NotNull(message = "창고를 입력하세요.") Long warehouseId,
            Long projectId,
            /*
             * 원본 불량처리입력 머리의 [처리방법](폐기 · 품목대체 · 정상사용). 전표 한 장에 하나라 머리에 두고
             * 줄마다 같은 값을 적는다. 폐기현황 · 대체사용현황이 이 값으로 불량처리 전표를 데려간다.
             */
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String handling,
            @jakarta.validation.constraints.NotEmpty(message = "품목을 입력하세요.")
            List<@jakarta.validation.Valid SlipLine> lines
    ) {}

    public record SlipLine(
            @NotNull(message = "품목을 입력하세요.") Long itemId,
            @NotNull(message = "수량을 입력하세요.")
            @jakarta.validation.constraints.Positive(message = "수량은 0보다 커야 합니다.") BigDecimal quantity,
            @Size(max = 30, message = "입력한 글자가 너무 깁니다. 30자까지 넣을 수 있습니다.")
            String kind,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.")
            String reason,
            /*
             * 불량처리 [처리방법] 품목대체의 <b>[정상품목]</b> 격자 줄 — 발견창고로 <b>들어온다</b>(2026-10-12 실측:
             * 포장김치 1 불량 + 배추 3 정상 → 재고수불부 포장김치 출고 1 · 배추 입고 3, 둘 다 '[불량] - 품목대체').
             * 나머지 줄(불량품목)은 나간다. 안 주면 불량품목 줄이다.
             */
            Boolean normal
    ) {}

    /** 전표 한 장 — 머리 값은 첫 줄의 것(모든 줄이 같다), 줄은 줄번호 차례. */
    public record SlipResponse(
            String adjustNo, LocalDate date, StockAdjustmentType type,
            Long partnerId, Long employeeId,
            Long warehouseId, String warehouseName,
            Long projectId, String projectName,
            /** 불량처리의 [처리방법] — 줄마다 같은 값이라 첫 줄 것. */
            String handling,
            List<AdjustmentResponse> lines
    ) {
        public static SlipResponse of(List<StockAdjustment> rows) {
            StockAdjustment h = rows.get(0);
            return new SlipResponse(h.getAdjustNo(), h.getAdjustDate(), h.getType(),
                    h.getPartnerId(), h.getEmployeeId(),
                    h.getWarehouse().getId(), h.getWarehouse().getName(),
                    h.getProject() != null ? h.getProject().getId() : null,
                    h.getProject() != null ? h.getProject().getName() : null,
                    h.getHandling(),
                    rows.stream().map(AdjustmentResponse::from).toList());
        }
    }

    /**
     * 기타이동 목록 응답 — <b>줄이 너무 많으면 앞부분만</b> 준다.
     *
     * <p>예전에는 알몸 배열이었고 기간 조건도 없어서, 다섯 화면이 열릴 때마다
     * <b>4,797줄·1.7MB</b> 를 통째로 받아 브라우저에서 걸렀다. 원본도 큰 결과를 그냥 주지
     * 않는다 — 조회 화면에 <b>[오천건이상조회]</b> 를 두고 그 위로는 눌러야 가게 한다
     * (사본 실측). 재고수불부·전표조회와 같은 방식이다.
     *
     * @param totalRows 조건에 걸린 <b>전체</b> 줄 수 — 화면이 "몇 건 중 몇 건" 이라 말하려면 필요하다.
     * @param truncated 잘라서 준 것인가. 화면은 이때만 [오천건이상조회] 를 띄운다.
     */
    public record AdjustmentListResponse(
            List<AdjustmentResponse> rows,
            long totalRows,
            boolean truncated
    ) {}
    /**
     * 원본 재고실사조회의 '간편' 줄 — 간편재고조정이 남긴 실사. 조정을 지웠으면 adjust* 가 비어 있다(원본 [조정전표] 빈칸).
     */
    public record StocktakeResponse(
            Long id, String stocktakeNo, LocalDate stocktakeDate,
            Long warehouseId, String warehouseName,
            Long itemId, String itemCode, String itemName, String spec,
            BigDecimal actualQty, Long employeeId,
            Long adjustmentId, String adjustNo, LocalDate adjustDate
    ) {
        public static StocktakeResponse from(com.erp.inventory.adjustment.Stocktake s) {
            StockAdjustment a = s.getAdjustment();
            return new StocktakeResponse(
                    s.getId(), s.getStocktakeNo(), s.getStocktakeDate(),
                    s.getWarehouse().getId(), s.getWarehouse().getName(),
                    s.getItem().getId(), s.getItem().getCode(), s.getItem().getName(), s.getItem().getSpec(),
                    s.getActualQty(), s.getEmployeeId(),
                    a == null ? null : a.getId(), a == null ? null : a.getAdjustNo(), a == null ? null : a.getAdjustDate());
        }
    }
}
