package com.erp.accounting.expensecontrol.dto;

import com.erp.accounting.expensecontrol.ExpenseControlType;
import com.erp.accounting.expensecontrol.ExpenseLimitType;
import com.erp.accounting.expensecontrol.ExpenseNoticeType;
import com.erp.accounting.expensecontrol.ExpensePeriodType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public final class ExpenseControlDtos {
    private ExpenseControlDtos() {}

    public record ControlTypeResponse(Long id, String code, String name,
                                      ExpensePeriodType periodType, String periodTypeName,
                                      boolean personControl,
                                      ExpenseLimitType limitType, String limitTypeName,
                                      ExpenseNoticeType noticeType, String noticeTypeName,
                                      String remark, boolean active) {
        public static ControlTypeResponse from(ExpenseControlType t) {
            return new ControlTypeResponse(t.getId(), t.getCode(), t.getName(),
                    t.getPeriodType(), t.getPeriodType().getDisplayName(), t.isPersonControl(),
                    t.getLimitType(), t.getLimitType().getDisplayName(),
                    t.getNoticeType(), t.getNoticeType().getDisplayName(), t.getRemark(), t.isActive());
        }
    }

    /** 등록 · 수정 같은 몸통(수정 때 code 는 무시 — 원본 수정 창은 코드가 글자로 막힌다). */
    public record SaveControlTypeRequest(@NotBlank @Size(max = 20) String code, @NotBlank @Size(max = 100) String name,
                                         @NotNull ExpensePeriodType periodType, @NotNull Boolean personControl,
                                         @NotNull ExpenseLimitType limitType, @NotNull ExpenseNoticeType noticeType,
                                         @Size(max = 500) String remark, Boolean active) {}
}
