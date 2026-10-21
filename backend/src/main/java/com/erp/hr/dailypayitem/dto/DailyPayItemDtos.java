package com.erp.hr.dailypayitem.dto;

import com.erp.hr.dailypayitem.DailyPayItem;
import com.erp.hr.dailypayitem.DailyPayItemKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public class DailyPayItemDtos {

    public record DailyPayItemResponse(
            Long id, DailyPayItemKind kind, String code, String name, int sortOrder, String payMethod,
            BigDecimal rate, String taxType, String formula, boolean active, boolean builtin
    ) {
        public static DailyPayItemResponse from(DailyPayItem i) {
            return from(i, null);
        }

        /** latestFormula — 계산식리스트에서 가장 늦은 적용시점 계산식(원본 격자 계산식 칸이 그것을 보인다, 2026-10-21). */
        public static DailyPayItemResponse from(DailyPayItem i, String latestFormula) {
            return new DailyPayItemResponse(i.getId(), i.getKind(), i.getCode(), i.getName(), i.getSortOrder(),
                    i.getPayMethod(), i.getRate(), i.getTaxType(), latestFormula != null ? latestFormula : i.formula(),
                    i.isActive(), i.isBuiltin());
        }
    }

    /** 원본 격자 한 줄 저장 — 코드는 처음 저장 뒤 막힌다(수정 때 보내도 무시). */
    public record DailyPayItemRequest(
            @NotNull(message = "구분을 입력 바랍니다.") DailyPayItemKind kind,
            @Size(max = 10, message = "입력한 글자가 너무 깁니다. 10자까지 넣을 수 있습니다.") String code,
            @NotBlank(message = "데이터를 입력하기 바랍니다.")
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.") String name,
            @NotNull(message = "데이터를 입력하기 바랍니다.") Integer sortOrder,
            @Size(max = 20) String payMethod,
            @PositiveOrZero(message = "배율은 0 이상이어야 합니다.") BigDecimal rate,
            @Size(max = 20) String taxType,
            Boolean active
    ) {}

    /** 계산식리스트 한 줄 — id 가 null 이면 기본 '2010/01 ~' 줄(자동 계산식, 지울 수 없음). applyMonth 는 yyyy-MM. */
    public record FormulaResponse(Long id, String applyMonth, String formula) {}

    /** 계산식등록 [저장(F8)] — 적용시점 연 · 월과 계산식. */
    public record FormulaRequest(
            @NotBlank(message = "적용시점을 입력 바랍니다.") String applyMonth,
            @NotBlank(message = "계산식을 입력 바랍니다.")
            @Size(max = 500, message = "입력한 글자가 너무 깁니다. 500자까지 넣을 수 있습니다.") String formula
    ) {}
}
