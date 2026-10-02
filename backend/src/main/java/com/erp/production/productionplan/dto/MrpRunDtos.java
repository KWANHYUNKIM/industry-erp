package com.erp.production.productionplan.dto;

import com.erp.production.productionplan.MrpRun;
import com.erp.production.productionplan.MrpRunKind;
import com.erp.production.productionplan.MrpRunLine;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 원본 생산계획/MRP리스트 · 생산계획리스트(수정) 의 요청·응답. */
public final class MrpRunDtos {

    private MrpRunDtos() {}

    /** 원본 [신규] 팝업 — 생성일자 · 생산계획기간 · 기준품목(없으면 전체) · 적요. */
    public record SaveRunRequest(
            LocalDate runDate,
            @NotNull(message = "생산계획기간을 정하세요.") LocalDate periodFrom,
            @NotNull(message = "생산계획기간을 정하세요.") LocalDate periodTo,
            Long baseItemId,
            @Size(max = 300) String note
    ) {}

    public record RunResponse(
            Long id, String runNo, LocalDate runDate, LocalDate periodFrom, LocalDate periodTo,
            Long baseItemId, String baseItemCode, String baseItemName, String note,
            /** [생산계획계산]·[MRP계산] 을 마지막으로 돌린 때 — null 이면 [생성] 만 보인다. */
            LocalDateTime planGeneratedAt, LocalDateTime mrpGeneratedAt,
            /** 저장된 결과 줄 수와 계획수량 합. */
            long planLines, BigDecimal planQty, long mrpLines, BigDecimal mrpQty,
            String createdBy, LocalDateTime createdAt
    ) {
        public static RunResponse from(MrpRun r, long planLines, BigDecimal planQty, long mrpLines, BigDecimal mrpQty) {
            return new RunResponse(r.getId(), r.getRunNo(), r.getRunDate(), r.getPeriodFrom(), r.getPeriodTo(),
                    r.getBaseItem() != null ? r.getBaseItem().getId() : null,
                    r.getBaseItem() != null ? r.getBaseItem().getCode() : null,
                    r.getBaseItem() != null ? r.getBaseItem().getName() : null,
                    r.getNote(), r.getPlanGeneratedAt(), r.getMrpGeneratedAt(),
                    planLines, planQty, mrpLines, mrpQty, r.getCreatedBy(), r.getCreatedAt());
        }
    }

    public record LineResponse(
            Long id, MrpRunKind kind, Integer lineNo,
            Long itemId, String itemCode, String itemName, String spec, String unit, String categoryName,
            LocalDate needDate, BigDecimal prevStock, BigDecimal safetyStock, BigDecimal minUnit, Integer leadTimeDays,
            BigDecimal decreaseQty, BigDecimal increaseQty,
            /** 계산이 낸 값 — [수정] 으로 고친 planQty 와 견준다. */
            BigDecimal calcQty, BigDecimal planQty, Long supplierId
    ) {
        public static LineResponse from(MrpRunLine l) {
            var i = l.getItem();
            return new LineResponse(l.getId(), l.getKind(), l.getLineNo(),
                    i.getId(), i.getCode(), i.getName(), i.getSpec(), i.getUnit(),
                    i.getCategory() != null ? i.getCategory().getDisplayName() : null,
                    l.getNeedDate(), l.getPrevStock(), l.getSafetyStock(), l.getMinUnit(), l.getLeadTimeDays(),
                    l.getDecreaseQty(), l.getIncreaseQty(), l.getCalcQty(), l.getPlanQty(), l.getSupplierId());
        }
    }

    /** 원본 [수정] — 계획수량만 고친다(나머지는 계산이 정한 값이다). */
    public record UpdateLinesRequest(@NotNull @Valid List<LineQty> lines) {}

    public record LineQty(
            @NotNull Long id,
            @NotNull(message = "계획수량을 입력하세요.") @PositiveOrZero(message = "계획수량은 0 이상이어야 합니다.") BigDecimal planQty
    ) {}
}
