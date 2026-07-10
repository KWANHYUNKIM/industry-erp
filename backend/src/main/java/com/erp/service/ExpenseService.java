package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Account;
import com.erp.domain.Expense;
import com.erp.dto.ExpenseDtos.CreateExpenseRequest;
import com.erp.dto.ExpenseDtos.ExpenseResponse;
import com.erp.repository.AccountRepository;
import com.erp.repository.ExpenseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final AccountRepository accountRepository;

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
                .amount(req.amount())
                .paymentMethod(req.paymentMethod())
                .department(req.department())
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
}
