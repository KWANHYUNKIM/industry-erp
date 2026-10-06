package com.erp.accounting.expense;

import com.erp.accounting.account.AccountService;
import com.erp.accounting.journal.JournalService;
import com.erp.accounting.journal.JournalSourceType;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.account.Account;
import com.erp.trade.partner.BusinessPartner;
import com.erp.accounting.expense.dto.ExpenseDtos.CreateExpenseRequest;
import com.erp.accounting.expense.dto.ExpenseDtos.ExpenseResponse;
import com.erp.accounting.account.AccountRepository;
import com.erp.trade.partner.BusinessPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.expense.dto.ExpenseDtos;
import com.erp.inventory.project.ProjectService;

@Service
@RequiredArgsConstructor
public class ExpenseService {

    private final ProjectService projectService;

    private final ExpenseRepository expenseRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final AccountRepository accountRepository;
    private final AccountService accountService;
    private final BusinessPartnerRepository partnerRepository;
    /**
     * 지출은 저장과 함께 회계전표를 만든다. 예전엔 분개를 만드는 메서드(createFromExpense)가 있는데
     * 아무도 부르지 않아 지출 34건이 장부에 한 장도 없었다 — 판관비가 손익·재무제표에서 통째로 빠졌다(39회차).
     */
    private final JournalService journalService;

    @Transactional(readOnly = true)
    public List<ExpenseResponse> findAll() {
        return expenseRepository.findAllWithAccount().stream()
                .map(ExpenseResponse::from)
                .toList();
    }

    @Transactional
    public ExpenseResponse create(CreateExpenseRequest req, String username) {
        Account account = accountService.getUsable(req.accountId());

        LocalDate date = req.expenseDate() != null ? req.expenseDate() : LocalDate.now();
        Expense e = Expense.builder()
                .expenseDate(date)
                // 채번은 DocumentNoGenerator 로만 한다(count()+1 은 삭제·동시성에서 겹친다).
                .docNo(docNoGenerator.next("EX-", "expenses", "doc_no", "expense_date", date))
                .account(account)
                .content(req.content())
                .partnerName(req.partnerName())
                .partner(matchPartner(req.partnerName()))
                .amount(req.amount())
                .vatAmount(req.vatAmount() != null ? req.vatAmount() : java.math.BigDecimal.ZERO)
                .paymentMethod(req.paymentMethod())
                .department(req.department())
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .createdBy(username)
                .build();
        Expense saved = expenseRepository.save(e);
        journalService.createFromExpense(saved);
        return ExpenseResponse.from(saved);
    }

    @Transactional
    public void delete(Long id) {
        if (!expenseRepository.existsById(id)) {
            throw ApiException.notFound("지출 내역을 찾을 수 없습니다. id=" + id);
        }
        journalService.deleteBySource(JournalSourceType.EXPENSE, id);   // 지출을 지우면 그 분개도
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
