package com.erp.accounting.cost.expenseitem.dto;

import com.erp.accounting.cost.expensecontrol.ExpenseControlType;
import com.erp.accounting.cost.expenseitem.ExpenseItem;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public final class ExpenseItemDtos {
    private ExpenseItemDtos() {}

    /**
     * 비용리스트 한 줄. 통제유형이 없는 비용은 원본처럼 인원통제 '사용안함' · 한도구분 '총금액' · 기간 빈칸.
     */
    public record ExpenseItemResponse(Long id, String code, String name,
                                      Long accountId, String accountCode, String accountName,
                                      Long controlTypeId, String controlTypeCode, String controlTypeName,
                                      String periodTypeName, String personControlName, String limitTypeName,
                                      BigDecimal limitAmount, List<Long> employeeIds,
                                      java.time.LocalDate controlFrom, java.time.LocalDate controlTo, List<Long> alertEmployeeIds,
                                      String remark, boolean active) {
        public static ExpenseItemResponse from(ExpenseItem i) {
            ExpenseControlType t = i.getControlType();
            return new ExpenseItemResponse(i.getId(), i.getCode(), i.getName(),
                    i.getAccount() != null ? i.getAccount().getId() : null,
                    i.getAccount() != null ? i.getAccount().getCode() : null,
                    i.getAccount() != null ? i.getAccount().getName() : null,
                    t != null ? t.getId() : null, t != null ? t.getCode() : null, t != null ? t.getName() : null,
                    t != null ? t.getPeriodType().getDisplayName() : null,
                    t != null && t.isPersonControl() ? "사용" : "사용안함",
                    t != null ? t.getLimitType().getDisplayName() : "총금액",
                    i.getLimitAmount(), List.copyOf(i.getEmployeeIds()),
                    i.getControlFrom(), i.getControlTo(), List.copyOf(i.getAlertEmployeeIds()), i.getRemark(), i.isActive());
        }
    }

    /** 등록 · 수정 같은 몸통(수정 때 code 는 무시). 통제유형이 없으면 한도 · 사용인원은 버린다(원본은 그 칸이 안 생긴다). */
    public record SaveExpenseItemRequest(@NotBlank @Size(max = 20) String code, @NotBlank @Size(max = 100) String name,
                                         Long accountId, Long controlTypeId,
                                         @PositiveOrZero BigDecimal limitAmount, List<Long> employeeIds,
                                         java.time.LocalDate controlFrom, java.time.LocalDate controlTo, List<Long> alertEmployeeIds,
                                         @Size(max = 500) String remark, Boolean active) {}

    /** 비용일괄등록(E060811) 저장 — 고친 줄만. 비용명 · 한도금액(통제유형이 있는 줄만 의미) 외의 값은 지금 값을 그대로 둔다. */
    public record BulkSaveRequest(@jakarta.validation.Valid List<BulkChange> changes) {}

    public record BulkChange(@jakarta.validation.constraints.NotNull Long id, @NotBlank @Size(max = 100) String name,
                             @PositiveOrZero BigDecimal limitAmount) {}
}
