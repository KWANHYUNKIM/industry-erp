package com.erp.accounting.ledger.account;

import com.erp.common.ApiException;
import com.erp.accounting.ledger.account.dto.AccountDtos.AccountResponse;
import com.erp.accounting.ledger.account.dto.AccountDtos.CreateAccountRequest;
import com.erp.accounting.ledger.account.dto.AccountDtos.UpdateAccountRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.accounting.ledger.account.dto.AccountDtos;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountRepository accountRepository;

    @Transactional(readOnly = true)
    public List<AccountResponse> findAll() {
        return findAll(false);
    }

    /** slipOnly 면 묶음 계정(전표에 못 쓰는 합계용 계정)을 뺀다 — 원본 계정 코드도움과 같다. */
    @Transactional(readOnly = true)
    public List<AccountResponse> findAll(boolean slipOnly) {
        return accountRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .filter(a -> !slipOnly || !a.isGroupAccount())
                .map(AccountResponse::from)
                .toList();
    }

    @Transactional
    public AccountResponse create(CreateAccountRequest req) {
        if (accountRepository.existsByCode(req.code())) {
            throw ApiException.badRequest("이미 존재하는 계정코드입니다: " + req.code());
        }
        Account a = Account.builder()
                .code(req.code())
                .name(req.name())
                .division(req.division())
                .detailCategory(req.detailCategory())
                .relatedWork(req.relatedWork() != null ? req.relatedWork() : AccountRelatedWork.NONE)
                .partnerAggregate(Boolean.TRUE.equals(req.partnerAggregate()))
                .active(true)
                .parent(parentOf(req.parentId()))
                .groupAccount(Boolean.TRUE.equals(req.groupAccount()))
                .evalKind(req.evalKind() != null ? req.evalKind() : AccountEvalKind.NONE)
                .cashFlowKind(req.cashFlowKind() != null ? req.cashFlowKind() : AccountCashFlowKind.NONE)
                .searchKeyword(req.searchKeyword()).remark1(req.remark1()).remark2(req.remark2())
                .displayOrder(req.displayOrder())
                .indentOrder(req.indentOrder() != null ? req.indentOrder() : 0)
                .showMethod1(Boolean.TRUE.equals(req.showMethod1())).showMethod2(Boolean.TRUE.equals(req.showMethod2()))
                .build();
        a.setDebitCredit(req.debitCredit());
        return AccountResponse.from(accountRepository.save(a));
    }

    /**
     * 새로 <b>고르는</b> 자리에서 쓴다. 사용중지한 계정은 거절한다.
     *
     * <p>폐지한 계정에 새 잔액이 쌓이면 재무제표에 없어야 할 줄이 계속 남는다.
     * 실측했더니 일반전표입력이 사용중지한 계정을 그대로 받았다.
     *
     * <p>자동으로 만드는 분개(판매 → 외상매출금 …)는 <b>계정코드</b>로 찾으므로 여기를
     * 지나지 않는다. 그쪽까지 막으면 기준계정 하나를 잘못 내렸을 때 전표 저장이 통째로 막힌다.
     */
    @Transactional(readOnly = true)
    public Account getUsable(Long id) {
        Account a = accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
        if (a.isGroupAccount()) {
            throw ApiException.badRequest(
                    "묶음 계정은 전표에 쓸 수 없습니다: " + a.getCode() + " " + a.getName());
        }
        if (!a.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 계정과목입니다: " + a.getCode() + " " + a.getName());
        }
        return a;
    }

    private Account parentOf(Long parentId) {
        if (parentId == null) return null;
        return accountRepository.findById(parentId)
                .orElseThrow(() -> ApiException.badRequest("상위계정을 찾을 수 없습니다. id=" + parentId));
    }

    @Transactional
    public AccountResponse update(Long id, UpdateAccountRequest req) {
        Account a = accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
        if (req.name() != null) a.setName(req.name());
        if (req.division() != null) a.setDivision(req.division());
        if (req.detailCategory() != null) a.setDetailCategory(req.detailCategory());
        if (req.active() != null) a.setActive(req.active());
        if (req.relatedWork() != null) a.setRelatedWork(req.relatedWork());
        if (req.partnerAggregate() != null) a.setPartnerAggregate(req.partnerAggregate());
        if (req.parentId() != null) a.setParent(req.parentId() == 0 ? null : parentOf(req.parentId()));
        if (req.groupAccount() != null) a.setGroupAccount(req.groupAccount());
        if (req.debitCredit() != null) a.setDebitCredit(req.debitCredit());
        if (req.evalKind() != null) a.setEvalKind(req.evalKind());
        if (req.cashFlowKind() != null) a.setCashFlowKind(req.cashFlowKind());
        if (req.searchKeyword() != null) a.setSearchKeyword(req.searchKeyword());
        if (req.remark1() != null) a.setRemark1(req.remark1());
        if (req.remark2() != null) a.setRemark2(req.remark2());
        if (req.displayOrder() != null) a.setDisplayOrder(req.displayOrder());
        if (req.indentOrder() != null) a.setIndentOrder(req.indentOrder());
        if (req.showMethod1() != null) a.setShowMethod1(req.showMethod1());
        if (req.showMethod2() != null) a.setShowMethod2(req.showMethod2());
        return AccountResponse.from(a);
    }
}
