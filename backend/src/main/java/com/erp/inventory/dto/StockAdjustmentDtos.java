package com.erp.inventory.dto;

import com.erp.inventory.domain.ItemCategory;
import com.erp.inventory.domain.StockAdjustment;
import com.erp.inventory.domain.enums.StockAdjustmentType;
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
            String kind, String handling
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
                    a.getKind(), a.getHandling());
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
}
