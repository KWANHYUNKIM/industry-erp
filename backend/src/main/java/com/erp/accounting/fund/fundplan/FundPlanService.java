package com.erp.accounting.fund.fundplan;

import com.erp.accounting.ledger.account.AccountService;
import com.erp.accounting.fund.bankcard.BankAccountRepository;
import com.erp.accounting.fund.fundplan.dto.FundPlanDtos.FundPlanRequest;
import com.erp.accounting.fund.fundplan.dto.FundPlanDtos.FundPlanResponse;
import com.erp.common.ApiException;
import com.erp.common.history.ChangeHistoryService;
import com.erp.inventory.project.ProjectService;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 회계 II &gt; 자금계획 — 계획전표 입력 · 수정 · 삭제(원본 E020511, 2026-10-12 실측).
 * 원본은 빈 창도 저장한다(금액 빈 줄이 하나 생긴다) — 막지 않는다. 회계처리(입금보고서 · 지출결의서 · 일반전표)는 아직 없다.
 */
@Service
@RequiredArgsConstructor
public class FundPlanService {

    private final FundPlanRepository repository;
    private final BankAccountRepository bankAccountRepository;
    private final AccountService accountService;
    private final PartnerService partnerService;
    private final ProjectService projectService;
    private final ChangeHistoryService changeHistory;

    /** 수정 창 [H] 이력의 대상 이름 — 한 번 정하면 바꾸지 않는다. */
    public static final String HISTORY_TARGET = "FUND_PLAN";

    @Transactional(readOnly = true)
    public List<FundPlanResponse> find(LocalDate from, LocalDate to) {
        return repository.findBetween(from != null ? from : LocalDate.of(1900, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31))
                .stream().map(FundPlanResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public FundPlanResponse get(Long id) {
        return FundPlanResponse.from(load(id));
    }

    @Transactional
    public FundPlanResponse create(FundPlanRequest req, String username) {
        FundPlan p = FundPlan.builder().createdBy(username).amount(BigDecimal.ZERO).build();
        apply(p, req, username);
        FundPlan saved = repository.save(p);
        changeHistory.record(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED);
        return FundPlanResponse.from(saved);
    }

    @Transactional
    public FundPlanResponse update(Long id, FundPlanRequest req, String username) {
        FundPlan p = load(id);
        apply(p, req, username);
        changeHistory.record(HISTORY_TARGET, p.getId(), ChangeHistoryService.UPDATED);
        return FundPlanResponse.from(p);
    }

    @Transactional
    public void delete(List<Long> ids) {
        for (Long id : ids) {
            repository.delete(load(id));
            changeHistory.record(HISTORY_TARGET, id, ChangeHistoryService.DELETED);
        }
    }

    private FundPlan load(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("계획전표를 찾을 수 없습니다. id=" + id));
    }

    private void apply(FundPlan p, FundPlanRequest r, String username) {
        p.setDirection(r.direction());
        p.setPlanDate(r.planDate());
        p.setDepartmentId(r.departmentId());
        p.setProject(r.projectId() != null ? projectService.get(r.projectId()) : null);
        p.setMethod(r.method());
        p.setBankAccount(r.bankAccountId() != null
                ? bankAccountRepository.findById(r.bankAccountId())
                    .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + r.bankAccountId()))
                : null);
        p.setNoteNo(r.method() == FundPlanMethod.NOTE ? r.noteNo() : null);
        p.setCounterAccount(r.counterAccountId() != null ? accountService.getUsable(r.counterAccountId()) : null);
        p.setPartner(r.partnerId() != null ? partnerService.get(r.partnerId()) : null);
        p.setAmount(r.amount() != null ? r.amount() : BigDecimal.ZERO);
        p.setMemo(r.memo());
        p.setUpdatedBy(username);
    }
}
