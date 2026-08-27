package com.erp.production.dto;

import com.erp.production.domain.BorOperation;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

/** BOR(작업소요시간) DTO. 원본 열: 생산품목 · 생산공정명 · 생산수량 · 작업순서 · 작업명 · 작업시간(H). */
public final class BorDtos {

    private BorDtos() {}

    public record SaveBorRequest(
            @NotNull(message = "생산품목을 선택하세요.") Long productId,
            @NotNull(message = "생산공정을 선택하세요.") Long processId,
            @NotNull(message = "작업순서를 입력하세요.") Integer seq,
            @NotBlank(message = "작업명을 입력하세요.") String workName,
            /** 이 작업시간이 몇 개 기준인가. 안 주면 1개 기준. */
            @Positive(message = "생산수량은 0보다 커야 합니다.") BigDecimal baseQty,
            @NotNull(message = "작업시간을 입력하세요.")
            @PositiveOrZero(message = "작업시간은 0 이상이어야 합니다.") BigDecimal workHours,
            String remark,
            Boolean active
    ) {}

    public record BorResponse(
            Long id,
            Long productId, String productCode, String productName, String productUnit,
            String categoryName,
            Long processId, String processCode, String processName,
            Integer seq,
            String workName,
            BigDecimal baseQty,
            BigDecimal workHours,
            /** 1개당 작업시간(H) = 작업시간 ÷ 생산수량. 화면이 매번 나누지 않게 서버가 낸다. */
            BigDecimal hoursPerUnit,
            String remark,
            boolean active
    ) {
        public static BorResponse from(BorOperation o) {
            BigDecimal base = o.getBaseQty() == null || o.getBaseQty().signum() == 0
                    ? BigDecimal.ONE : o.getBaseQty();
            return new BorResponse(
                    o.getId(),
                    o.getProduct().getId(), o.getProduct().getCode(), o.getProduct().getName(),
                    o.getProduct().getUnit(),
                    o.getProduct().getCategory() != null ? o.getProduct().getCategory().getDisplayName() : null,
                    o.getProcess().getId(), o.getProcess().getCode(), o.getProcess().getName(),
                    o.getSeq(), o.getWorkName(), o.getBaseQty(), o.getWorkHours(),
                    o.getWorkHours().divide(base, 6, java.math.RoundingMode.HALF_UP),
                    o.getRemark(), o.isActive());
        }
    }
}
