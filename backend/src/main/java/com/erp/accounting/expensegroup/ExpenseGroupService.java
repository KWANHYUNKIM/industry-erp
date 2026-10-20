package com.erp.accounting.expensegroup;

import com.erp.accounting.expensecontrol.ExpenseControlService;
import com.erp.accounting.expensegroup.dto.ExpenseGroupDtos.ExpenseGroupResponse;
import com.erp.accounting.expensegroup.dto.ExpenseGroupDtos.SaveExpenseGroupRequest;
import com.erp.accounting.expenseitem.ExpenseItemService;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 비용그룹등록(E060810). */
@Service
@RequiredArgsConstructor
public class ExpenseGroupService {

    private final ExpenseGroupRepository repository;
    private final ExpenseControlService controlService;
    private final ExpenseItemService itemService;

    @Transactional(readOnly = true)
    public List<ExpenseGroupResponse> findAll() {
        return repository.findAllWithRefs().stream().map(ExpenseGroupResponse::from).toList();
    }

    /** 원본 신규 창이 [비용그룹코드] 에 미리 채우는 다음 번호(00001, 00002 → 00003). 숫자 코드만 센다. */
    @Transactional(readOnly = true)
    public String nextCode() {
        int max = repository.findAllCodes().stream().filter(c -> c.matches("\\d+"))
                .mapToInt(c -> c.length() > 9 ? 0 : Integer.parseInt(c)).max().orElse(0);
        return String.format("%05d", max + 1);
    }

    @Transactional(readOnly = true)
    public ExpenseGroup get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("비용그룹을 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public ExpenseGroupResponse create(SaveExpenseGroupRequest req) {
        String code = req.code().trim();
        if (repository.existsByCode(code)) throw ApiException.conflict("이미 비용그룹등록에 존재하는 코드입니다.");
        ExpenseGroup g = ExpenseGroup.builder().code(code).build();
        apply(g, req);
        return ExpenseGroupResponse.from(repository.save(g));
    }

    @Transactional
    public ExpenseGroupResponse update(Long id, SaveExpenseGroupRequest req) {
        ExpenseGroup g = get(id);
        apply(g, req);
        if (req.active() != null) g.setActive(req.active());
        return ExpenseGroupResponse.from(g);
    }

    @Transactional
    public void setActive(List<Long> ids, boolean active) {
        for (Long id : ids) get(id).setActive(active);
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            ExpenseGroup g = get(id);
            try {
                repository.delete(g);
                repository.flush();
            } catch (DataIntegrityViolationException e) {
                throw ApiException.conflict("비용내역에서 쓰고 있는 비용그룹입니다. [" + g.getCode() + "]");
            }
        }
    }

    private void apply(ExpenseGroup g, SaveExpenseGroupRequest req) {
        g.setName(req.name().trim());
        g.setControlType(req.controlTypeId() != null ? controlService.get(req.controlTypeId()) : null);
        g.getItems().clear();
        if (req.itemIds() != null) for (Long id : req.itemIds()) g.getItems().add(itemService.get(id));
        g.setAddInput(Boolean.TRUE.equals(req.addInput()));
        g.setRemark(req.remark());
    }
}
