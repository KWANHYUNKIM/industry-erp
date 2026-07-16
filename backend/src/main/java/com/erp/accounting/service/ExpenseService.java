package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.accounting.domain.Account;
import com.erp.trade.domain.BusinessPartner;
import com.erp.accounting.domain.Expense;
import com.erp.accounting.dto.ExpenseDtos.CreateExpenseRequest;
import com.erp.accounting.dto.ExpenseDtos.ExpenseResponse;
import com.erp.accounting.repository.AccountRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.accounting.repository.ExpenseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.ExpenseDtos;
import com.erp.inventory.service.ProjectService;

@Service
@RequiredArgsConstructor
public class ExpenseService {

    private final ProjectService projectService;

    private final ExpenseRepository expenseRepository;
    private final AccountRepository accountRepository;
    private final BusinessPartnerRepository partnerRepository;

    @Transactional(readOnly = true)
    public List<ExpenseResponse> findAll() {
        return expenseRepository.findAllWithAccount().stream()
                .map(ExpenseResponse::from)
                .toList();
    }

    @Transactional
    public ExpenseResponse create(CreateExpenseRequest req, String username) {
        Account account = accountRepository.findById(req.accountId())
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + req.accountId()));

        Expense e = Expense.builder()
                .expenseDate(req.expenseDate() != null ? req.expenseDate() : LocalDate.now())
                .account(account)
                .content(req.content())
                .partnerName(req.partnerName())
                .partner(matchPartner(req.partnerName()))
                .amount(req.amount())
                .paymentMethod(req.paymentMethod())
                .department(req.department())
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .createdBy(username)
                .build();
        return ExpenseResponse.from(expenseRepository.save(e));
    }

    @Transactional
    public void delete(Long id) {
        if (!expenseRepository.existsById(id)) {
            throw ApiException.notFound("지출 내역을 찾을 수 없습니다. id=" + id);
        }
        expenseRepository.deleteById(id);
    }

    /**
     * 자유입력된 거래처명이 마스터와 정확히 일치할 때만 연결한다.
     * 일치하지 않으면 null 이다 — 마스터에 없는 상대에게도 돈은 나가고, 그 이름은 그대로 보존한다.
     * 부분일치로 엮으면 '한울'이 '한울ICT'에 붙는 식으로 엉뚱한 거래처가 달린다.
     */
    private BusinessPartner matchPartner(String name) {
        if (name == null || name.isBlank()) return null;
        return partnerRepository.findByName(name.trim()).orElse(null);
    }
}
