package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.accounting.domain.Account;
import com.erp.accounting.domain.AccountDivision;
import com.erp.accounting.domain.BankAccount;
import com.erp.accounting.domain.Expense;
import com.erp.accounting.domain.Income;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.domain.enums.ReceiptMethod;
import com.erp.accounting.dto.BankCardDtos.BankTxnRequest;
import com.erp.accounting.dto.BankCardDtos.BankTxnResponse;
import com.erp.accounting.dto.IncomeDtos.AccountSummaryRow;
import com.erp.accounting.dto.IncomeDtos.CreateIncomeRequest;
import com.erp.accounting.dto.IncomeDtos.IncomeExpenseStatus;
import com.erp.accounting.dto.IncomeDtos.IncomeResponse;
import com.erp.accounting.dto.JournalDtos.CashTxnRequest;
import com.erp.accounting.dto.JournalDtos.CreateJournalRequest;
import com.erp.accounting.dto.JournalDtos.ManualLineInput;
import com.erp.accounting.repository.AccountRepository;
import com.erp.accounting.repository.BankAccountRepository;
import com.erp.accounting.repository.ExpenseRepository;
import com.erp.accounting.repository.IncomeRepository;
import com.erp.accounting.repository.JournalEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.erp.accounting.dto.BankCardDtos;
import com.erp.accounting.dto.IncomeDtos;
import com.erp.accounting.dto.JournalDtos;

/**
 * 수입비용 (회계 II). 비용등록(Expense)의 대칭인 수입등록과, 둘을 대조하는 수입비용현황.
 *
 * 수입은 매출 전표를 거치지 않는 수익(이자수익·임대료·잡이익)이다. 등록하면 바로 분개가 생긴다.
 * 차변은 회수 수단이 정한다 — 현금이면 현금, 계좌면 그 예금계정(계좌 잔액도 함께 오른다),
 * 외상이면 외상매출금. 계좌 입금은 BankCardService 를 거친다: 잔액 규칙을 그쪽이 소유한다.
 */
@Service
@RequiredArgsConstructor
public class IncomeService {

    private static final String ACC_RECEIVABLE = "108";   // 외상매출금

    private final IncomeRepository incomeRepository;
    private final ExpenseRepository expenseRepository;
    private final AccountRepository accountRepository;
    private final BankAccountRepository bankAccountRepository;
    private final JournalEntryRepository journalEntryRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;

    @Transactional(readOnly = true)
    public List<IncomeResponse> findAll(LocalDate from, LocalDate to) {
        return incomeRepository.findByPeriod(nz(from, LocalDate.of(1900, 1, 1)), nz(to, LocalDate.of(9999, 12, 31)))
                .stream().map(IncomeResponse::from).toList();
    }

    @Transactional
    public IncomeResponse create(CreateIncomeRequest req, String username) {
        Account account = accountRepository.findById(req.accountId())
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + req.accountId()));
        if (account.getDivision() != AccountDivision.REVENUE) {
            throw ApiException.badRequest("수입은 수익 계정에만 잡을 수 있습니다: "
                    + account.getName() + " (" + account.getDivision().getDisplayName() + ")");
        }
        LocalDate date = req.incomeDate() != null ? req.incomeDate() : LocalDate.now();
        String desc = req.content();

        Income income = Income.builder()
                .incomeDate(date)
                .account(account)
                .content(req.content())
                .partnerName(req.partnerName())
                .amount(req.amount())
                .receiptMethod(req.receiptMethod())
                .department(req.department())
                .createdBy(username)
                .build();

        JournalEntry entry;
        if (req.receiptMethod() == ReceiptMethod.BANK) {
            if (req.bankAccountId() == null) {
                throw ApiException.badRequest("계좌입금은 입금될 계좌를 선택해야 합니다.");
            }
            BankAccount bank = bankAccountRepository.findById(req.bankAccountId())
                    .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + req.bankAccountId()));

            // 계좌 잔액과 예금 분개는 BankCardService 가 소유한다. 상대계정으로 수익 계정을 넘긴다.
            BankTxnResponse txn = bankCardService.createTxn(new BankTxnRequest(
                    bank.getId(), true, req.amount(), account.getId(), null, date, desc), username);
            entry = journalEntryRepository.findById(txn.journalEntryId())
                    .orElseThrow(() -> ApiException.badRequest("입금 전표의 회계전표를 찾을 수 없습니다."));
            income.setBankAccount(bank);

        } else if (req.receiptMethod() == ReceiptMethod.CASH) {
            // 차)현금 / 대)수익계정
            entry = journalService.createCashTxn(
                    new CashTxnRequest(date, true, account.getId(), req.amount(), null, desc), username);

        } else {
            // 외상: 차)외상매출금 / 대)수익계정
            Account receivable = accountRepository.findByCode(ACC_RECEIVABLE)
                    .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + ACC_RECEIVABLE));
            entry = journalService.createManual(new CreateJournalRequest(
                    date, desc, null,
                    List.of(new ManualLineInput(receivable.getId(), req.amount(), null, "외상매출금"),
                            new ManualLineInput(account.getId(), null, req.amount(), account.getName()))),
                    username);
        }

        income.setJournalEntry(entry);
        return IncomeResponse.from(incomeRepository.save(income));
    }

    /**
     * 수입비용현황: 기간 내 수입과 비용을 계정별로 모아 대조한다.
     * 판매/구매 전표에서 나온 매출·매입은 여기 들어오지 않는다 — 그건 손익계산서가 본다.
     */
    @Transactional(readOnly = true)
    public IncomeExpenseStatus status(LocalDate from, LocalDate to) {
        LocalDate f = nz(from, LocalDate.now().withDayOfMonth(1));
        LocalDate t = nz(to, LocalDate.now());

        Map<Long, AccountSum> incomes = new LinkedHashMap<>();
        for (Income i : incomeRepository.findByPeriod(f, t)) {
            incomes.computeIfAbsent(i.getAccount().getId(), k -> new AccountSum(i.getAccount())).add(i.getAmount());
        }
        Map<Long, AccountSum> expenses = new LinkedHashMap<>();
        for (Expense e : expenseRepository.findByPeriod(f, t)) {
            expenses.computeIfAbsent(e.getAccount().getId(), k -> new AccountSum(e.getAccount())).add(e.getAmount());
        }

        BigDecimal totalIncome = total(incomes);
        BigDecimal totalExpense = total(expenses);

        return new IncomeExpenseStatus(f, t,
                totalIncome, totalExpense, totalIncome.subtract(totalExpense),
                rows(incomes, totalIncome), rows(expenses, totalExpense));
    }

    @Transactional
    public void delete(Long id) {
        Income income = incomeRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수입 내역을 찾을 수 없습니다. id=" + id));
        if (income.getReceiptMethod() == ReceiptMethod.BANK) {
            throw ApiException.badRequest(
                    "계좌입금으로 등록된 수입은 삭제할 수 없습니다. 계좌 잔액이 이미 움직였습니다 — 반대 입출금으로 정정하세요.");
        }
        incomeRepository.delete(income);
    }

    private List<AccountSummaryRow> rows(Map<Long, AccountSum> map, BigDecimal total) {
        List<AccountSummaryRow> rows = new ArrayList<>();
        for (AccountSum s : map.values()) {
            rows.add(new AccountSummaryRow(
                    s.account.getId(), s.account.getCode(), s.account.getName(),
                    s.amount, ratio(s.amount, total)));
        }
        rows.sort((a, b) -> b.amount().compareTo(a.amount()));
        return rows;
    }

    private BigDecimal total(Map<Long, AccountSum> map) {
        return map.values().stream().map(s -> s.amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal ratio(BigDecimal amount, BigDecimal total) {
        if (total.signum() == 0) return BigDecimal.ZERO;
        return amount.multiply(new BigDecimal("100")).divide(total, 1, RoundingMode.HALF_UP);
    }

    private LocalDate nz(LocalDate v, LocalDate fallback) {
        return v != null ? v : fallback;
    }

    /** 계정별 누적 */
    private static final class AccountSum {
        private final Account account;
        private BigDecimal amount = BigDecimal.ZERO;

        private AccountSum(Account account) {
            this.account = account;
        }

        private void add(BigDecimal v) {
            amount = amount.add(v);
        }
    }
}
