package com.erp.accounting.cost.expensegroup.dto;

import com.erp.accounting.cost.expensecontrol.ExpenseControlType;
import com.erp.accounting.cost.expensegroup.ExpenseGroup;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public final class ExpenseGroupDtos {
    private ExpenseGroupDtos() {}

    public record GroupItem(Long id, String code, String name) {}

    /** 비용그룹리스트 한 줄 — 통제유형이 없으면 원본처럼 인원통제 '사용안함' · 한도구분 '총금액'. */
    public record ExpenseGroupResponse(Long id, String code, String name,
                                       Long controlTypeId, String controlTypeCode, String controlTypeName,
                                       String periodTypeName, String personControlName, String limitTypeName,
                                       List<GroupItem> items, boolean addInput, String remark, boolean active) {
        public static ExpenseGroupResponse from(ExpenseGroup g) {
            ExpenseControlType t = g.getControlType();
            return new ExpenseGroupResponse(g.getId(), g.getCode(), g.getName(),
                    t != null ? t.getId() : null, t != null ? t.getCode() : null, t != null ? t.getName() : null,
                    t != null ? t.getPeriodType().getDisplayName() : null,
                    t != null && t.isPersonControl() ? "사용" : "사용안함",
                    t != null ? t.getLimitType().getDisplayName() : "총금액",
                    g.getItems().stream().map(i -> new GroupItem(i.getId(), i.getCode(), i.getName())).toList(),
                    g.isAddInput(), g.getRemark(), g.isActive());
        }
    }

    public record SaveExpenseGroupRequest(@NotBlank @Size(max = 20) String code, @NotBlank @Size(max = 100) String name,
                                          Long controlTypeId, List<Long> itemIds, Boolean addInput,
                                          @Size(max = 500) String remark, Boolean active) {}
}
