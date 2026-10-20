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
            return new DailyPayItemResponse(i.getId(), i.getKind(), i.getCode(), i.getName(), i.getSortOrder(),
                    i.getPayMethod(), i.getRate(), i.getTaxType(), i.formula(), i.isActive(), i.isBuiltin());
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
}
