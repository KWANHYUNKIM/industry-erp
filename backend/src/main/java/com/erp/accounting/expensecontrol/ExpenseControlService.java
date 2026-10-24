package com.erp.accounting.expensecontrol;

import com.erp.accounting.expensecontrol.dto.ExpenseControlDtos.ControlTypeResponse;
import com.erp.accounting.expensecontrol.dto.ExpenseControlDtos.SaveControlTypeRequest;
import com.erp.common.ApiException;
import com.erp.common.history.ChangeHistoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 통제유형등록(E060808). 비용 · 비용그룹 서비스가 {@link #get} 으로 통제유형을 붙인다. */
@Service
@RequiredArgsConstructor
public class ExpenseControlService {

    private final ExpenseControlTypeRepository repository;
    private final ChangeHistoryService changeHistory;
    private static final String HISTORY_TARGET = "EXPENSE_CONTROL_TYPE";

    @Transactional(readOnly = true)
    public List<ControlTypeResponse> findAll() {
        return repository.findAllByOrderByCodeAsc().stream().map(ControlTypeResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ExpenseControlType get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("통제유형을 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public ControlTypeResponse create(SaveControlTypeRequest req) {
        String code = req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 통제유형등록에 존재하는 코드입니다.");
        ExpenseControlType t = ExpenseControlType.builder().code(code).build();
        apply(t, req);
        ExpenseControlType saved = repository.save(t);
        changeHistory.record(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED);
        return ControlTypeResponse.from(saved);
    }

    @Transactional
    public ControlTypeResponse update(Long id, SaveControlTypeRequest req) {
        ExpenseControlType t = get(id);
        boolean wasActive = t.isActive();
        apply(t, req);
        if (req.active() != null) t.setActive(req.active());
        changeHistory.recordUpdate(HISTORY_TARGET, t.getId(), wasActive, t.isActive());
        return ControlTypeResponse.from(t);
    }

    @Transactional
    public void setActive(List<Long> ids, boolean active) {
        for (Long id : ids) {
            ExpenseControlType t = get(id);
            boolean wasActive = t.isActive();
            t.setActive(active);
            changeHistory.recordUpdate(HISTORY_TARGET, id, wasActive, active);
        }
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            ExpenseControlType t = get(id);
            try {
                repository.delete(t);
                repository.flush();
                changeHistory.record(HISTORY_TARGET, t.getId(), ChangeHistoryService.DELETED);
            } catch (DataIntegrityViolationException e) {
                throw ApiException.conflict("비용 · 비용그룹에서 쓰고 있는 통제유형입니다. [" + t.getCode() + "]");
            }
        }
    }

    private static void apply(ExpenseControlType t, SaveControlTypeRequest req) {
        t.setName(req.name().trim());
        t.setPeriodType(req.periodType());
        t.setPersonControl(req.personControl());
        t.setLimitType(req.limitType());
        t.setNoticeType(req.noticeType());
        t.setRemark(req.remark());
    }
}
