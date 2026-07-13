package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Account;
import com.erp.domain.AccountDivision;
import com.erp.domain.JournalLine;
import com.erp.dto.JournalDtos.AccountLedgerResponse;
import com.erp.dto.JournalDtos.BalanceSheetResponse;
import com.erp.dto.JournalDtos.IncomeStatementResponse;
import com.erp.dto.JournalDtos.JournalEntryResponse;
import com.erp.dto.JournalDtos.LedgerRow;
import com.erp.dto.JournalDtos.StatementRow;
import com.erp.dto.JournalDtos.TrialBalanceResponse;
import com.erp.dto.JournalDtos.TrialBalanceRow;
import com.erp.repository.AccountRepository;
import com.erp.repository.JournalEntryRepository;
import com.erp.repository.JournalLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** 회계전표에서 파생되는 조회: 전표목록·계정별원장·시산표·재무상태표·손익계산서 */
@Service
@RequiredArgsConstructor
public class JournalQueryService {

    /** 재무상태표 누적 시작 기준일(사실상 전체 기간). */
    private static final LocalDate EPOCH = LocalDate.of(2000, 1, 1);

    private final JournalEntryRepository entryRepository;
    private final JournalLineRepository lineRepository;
    private final AccountRepository accountRepository;

    @Transactional(readOnly = true)
    public List<JournalEntryResponse> entries(LocalDate from, LocalDate to) {
        return entryRepository.findByPeriod(from, to).stream()
                .map(JournalEntryResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public JournalEntryResponse entry(Long id) {
        return entryRepository.findById(id)
                .map(JournalEntryResponse::from)
                .orElseThrow(() -> ApiException.notFound("회계전표를 찾을 수 없습니다. id=" + id));
    }

    /** 계정별원장: 해당 계정의 기간 내 분개 + 누적 잔액. */
    @Transactional(readOnly = true)
    public AccountLedgerResponse accountLedger(Long accountId, LocalDate from, LocalDate to) {
        Account account = accountRepository.findById(accountId)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + accountId));

        List<JournalLine> lines = lineRepository.findByAccountAndPeriod(accountId, from, to);
        boolean debitSide = isDebitSide(account.getDivision());

        List<LedgerRow> rows = new ArrayList<>();
        BigDecimal running = BigDecimal.ZERO;
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        for (JournalLine l : lines) {
            // 잔액은 계정 구분의 증가 방향으로 누적한다.
            running = running.add(debitSide
                    ? l.getDebit().subtract(l.getCredit())
                    : l.getCredit().subtract(l.getDebit()));
            totalDebit = totalDebit.add(l.getDebit());
            totalCredit = totalCredit.add(l.getCredit());
            rows.add(new LedgerRow(
                    l.getEntry().getEntryDate(), l.getEntry().getDocNo(), l.getDescription(),
                    l.getEntry().getPartner() != null ? l.getEntry().getPartner().getName() : null,
                    l.getDebit(), l.getCredit(), running));
        }
        return new AccountLedgerResponse(
                account.getId(), account.getCode(), account.getName(), account.getDivision(),
                totalDebit, totalCredit, running, rows);
    }

    /** 합계잔액시산표. 전체 차변합 = 전체 대변합이면 대차평형. */
    @Transactional(readOnly = true)
    public TrialBalanceResponse trialBalance(LocalDate from, LocalDate to) {
        List<TrialBalanceRow> rows = new ArrayList<>();
        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;

        for (Object[] r : lineRepository.sumByAccount(from, to)) {
            Long accountId = (Long) r[0];
            String code = (String) r[1];
            String name = (String) r[2];
            AccountDivision division = (AccountDivision) r[3];
            BigDecimal debit = (BigDecimal) r[4];
            BigDecimal credit = (BigDecimal) r[5];
            BigDecimal balance = isDebitSide(division)
                    ? debit.subtract(credit)
                    : credit.subtract(debit);
            rows.add(new TrialBalanceRow(accountId, code, name, division, debit, credit, balance));
            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);
        }
        return new TrialBalanceResponse(from, to, totalDebit, totalCredit,
                totalDebit.compareTo(totalCredit) == 0, rows);
    }

    /** 재무상태표: EPOCH~asOf 누적. 자산 = 부채 + 자본 + 당기순이익. */
    @Transactional(readOnly = true)
    public BalanceSheetResponse balanceSheet(LocalDate asOf) {
        List<StatementRow> assets = new ArrayList<>();
        List<StatementRow> liabilities = new ArrayList<>();
        List<StatementRow> equity = new ArrayList<>();
        BigDecimal totalAssets = BigDecimal.ZERO, totalLiab = BigDecimal.ZERO, totalEquity = BigDecimal.ZERO;
        BigDecimal revenue = BigDecimal.ZERO, expense = BigDecimal.ZERO;

        for (Object[] r : lineRepository.sumByAccount(EPOCH, asOf)) {
            AccountDivision division = (AccountDivision) r[3];
            BigDecimal debit = (BigDecimal) r[4];
            BigDecimal credit = (BigDecimal) r[5];
            BigDecimal signed = isDebitSide(division) ? debit.subtract(credit) : credit.subtract(debit);
            StatementRow row = new StatementRow((String) r[1], (String) r[2], division, signed);
            switch (division) {
                case ASSET -> { assets.add(row); totalAssets = totalAssets.add(signed); }
                case LIABILITY -> { liabilities.add(row); totalLiab = totalLiab.add(signed); }
                case EQUITY -> { equity.add(row); totalEquity = totalEquity.add(signed); }
                case REVENUE -> revenue = revenue.add(signed);
                case EXPENSE -> expense = expense.add(signed);
            }
        }
        BigDecimal netIncome = revenue.subtract(expense);
        // 당기순이익은 자본에 귀속 → 대차 검증: 자산 == 부채 + 자본 + 순이익
        boolean balanced = totalAssets.compareTo(totalLiab.add(totalEquity).add(netIncome)) == 0;
        return new BalanceSheetResponse(asOf, assets, totalAssets, liabilities, totalLiab,
                equity, totalEquity, netIncome, balanced);
    }

    /** 손익계산서: from~to 기간. 당기순이익 = 수익 - 비용. */
    @Transactional(readOnly = true)
    public IncomeStatementResponse incomeStatement(LocalDate from, LocalDate to) {
        List<StatementRow> revenues = new ArrayList<>();
        List<StatementRow> expenses = new ArrayList<>();
        BigDecimal totalRevenue = BigDecimal.ZERO, totalExpense = BigDecimal.ZERO;

        for (Object[] r : lineRepository.sumByAccount(from, to)) {
            AccountDivision division = (AccountDivision) r[3];
            BigDecimal debit = (BigDecimal) r[4];
            BigDecimal credit = (BigDecimal) r[5];
            if (division == AccountDivision.REVENUE) {
                BigDecimal amount = credit.subtract(debit);
                revenues.add(new StatementRow((String) r[1], (String) r[2], division, amount));
                totalRevenue = totalRevenue.add(amount);
            } else if (division == AccountDivision.EXPENSE) {
                BigDecimal amount = debit.subtract(credit);
                expenses.add(new StatementRow((String) r[1], (String) r[2], division, amount));
                totalExpense = totalExpense.add(amount);
            }
        }
        return new IncomeStatementResponse(from, to, revenues, totalRevenue,
                expenses, totalExpense, totalRevenue.subtract(totalExpense));
    }

    /** 자산·비용은 차변이 증가 방향, 부채·자본·수익은 대변이 증가 방향. */
    private static boolean isDebitSide(AccountDivision division) {
        return division == AccountDivision.ASSET || division == AccountDivision.EXPENSE;
    }
}
