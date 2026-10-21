package com.erp.accounting.expenseitem;

import com.erp.accounting.account.AccountService;
import com.erp.accounting.expensecontrol.ExpenseControlService;
import com.erp.accounting.expenseitem.dto.ExpenseItemDtos.ExpenseItemResponse;
import com.erp.accounting.expenseitem.dto.ExpenseItemDtos.SaveExpenseItemRequest;
import com.erp.common.ApiException;
import com.erp.common.history.ChangeHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/** 비용등록(E060809) — 비용 마스터. */
@Service
@RequiredArgsConstructor
public class ExpenseItemService {

    private final ExpenseItemRepository repository;
    private final ChangeHistoryService changeHistory;
    private static final String HISTORY_TARGET = "EXPENSE_ITEM";
    private final AccountService accountService;
    private final ExpenseControlService controlService;

    @Transactional(readOnly = true)
    public List<ExpenseItemResponse> findAll() {
        return repository.findAllWithRefs().stream().map(ExpenseItemResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ExpenseItem get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("비용을 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public ExpenseItemResponse create(SaveExpenseItemRequest req) {
        String code = req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 비용등록에 존재하는 코드입니다.");
        ExpenseItem i = ExpenseItem.builder().code(code).build();
        apply(i, req);
        ExpenseItem saved = repository.save(i);
        changeHistory.record(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED);
        return ExpenseItemResponse.from(saved);
    }

    @Transactional
    public ExpenseItemResponse update(Long id, SaveExpenseItemRequest req) {
        ExpenseItem i = get(id);
        boolean wasActive = i.isActive();
        apply(i, req);
        if (req.active() != null) i.setActive(req.active());
        changeHistory.recordUpdate(HISTORY_TARGET, i.getId(), wasActive, i.isActive());
        return ExpenseItemResponse.from(i);
    }

    @Transactional
    public void setActive(List<Long> ids, boolean active) {
        for (Long id : ids) {
            ExpenseItem i = get(id);
            boolean wasActive = i.isActive();
            i.setActive(active);
            changeHistory.recordUpdate(HISTORY_TARGET, id, wasActive, active);
        }
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            ExpenseItem i = get(id);
            try {
                repository.delete(i);
                repository.flush();
                changeHistory.record(HISTORY_TARGET, i.getId(), ChangeHistoryService.DELETED);
            } catch (DataIntegrityViolationException e) {
                throw ApiException.conflict("비용내역 · 비용그룹에서 쓰고 있는 비용입니다. [" + i.getCode() + "]");
            }
        }
    }

    private void apply(ExpenseItem i, SaveExpenseItemRequest req) {
        i.setName(req.name().trim());
        i.setAccount(req.accountId() != null ? accountService.getUsable(req.accountId()) : null);
        i.setControlType(req.controlTypeId() != null ? controlService.get(req.controlTypeId()) : null);
        i.getEmployeeIds().clear();
        i.getAlertEmployeeIds().clear();
        if (i.getControlType() != null) {
            i.setLimitAmount(req.limitAmount() != null ? req.limitAmount() : BigDecimal.ZERO);
            if (req.employeeIds() != null) i.getEmployeeIds().addAll(req.employeeIds());
            if (req.alertEmployeeIds() != null) i.getAlertEmployeeIds().addAll(req.alertEmployeeIds());
            boolean designated = i.getControlType().getPeriodType() == com.erp.accounting.expensecontrol.ExpensePeriodType.DESIGNATED;
            i.setControlFrom(designated ? (req.controlFrom() != null ? req.controlFrom() : java.time.LocalDate.now()) : null);
            i.setControlTo(designated ? (req.controlTo() != null ? req.controlTo() : java.time.LocalDate.now()) : null);
        } else {
            i.setLimitAmount(null);
            i.setControlFrom(null);
            i.setControlTo(null);
        }
        i.setRemark(req.remark());
    }
}
