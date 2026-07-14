package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Account;
import com.erp.domain.AccountDivision;
import com.erp.domain.Budget;
import com.erp.domain.CashPlan;
import com.erp.domain.enums.CashFlowType;
import com.erp.dto.BudgetDtos.BudgetRequest;
import com.erp.dto.BudgetDtos.BudgetRow;
import com.erp.dto.BudgetDtos.BudgetStatus;
import com.erp.dto.BudgetDtos.CashPlanRequest;
import com.erp.dto.BudgetDtos.CashPlanRow;
import com.erp.dto.BudgetDtos.CashPlanStatus;
import com.erp.dto.BudgetDtos.UpdateBudgetRequest;
import com.erp.repository.AccountRepository;
import com.erp.repository.BankTransactionRepository;
import com.erp.repository.BudgetRepository;
import com.erp.repository.CashPlanRepository;
import com.erp.repository.JournalLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 회계 II — 예산관리 · 자금계획.
 *
 * 둘 다 계획만 저장하고 실적은 볼 때 집계한다.
 *   예산 집행실적 = 회계전표(journal_lines)에서 그 달·그 계정의 금액
 *   자금 실적     = 계좌 입출금(bank_transactions)에서 그 달의 입금·출금
 * 실적을 따로 저장해 두면 전표를 고치는 순간 어긋난다. 그래서 복제하지 않는다.
 */
@Service
@RequiredArgsConstructor
public class BudgetService {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private final BudgetRepository budgetRepository;
    private final CashPlanRepository cashPlanRepository;
    private final AccountRepository accountRepository;
    private final JournalLineRepository journalLineRepository;
    private final BankTransactionRepository bankTransactionRepository;

    // ── 예산관리 ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public BudgetStatus budgets(String period) {
        YearMonth ym = parse(period);
        Map<Long, BigDecimal> actuals = actualsByAccount(ym);

        List<BudgetRow> rows = budgetRepository.findByPeriodWithAccount(period).stream()
                .map(b -> toRow(b, actuals.getOrDefault(b.getAccount().getId(), BigDecimal.ZERO)))
                .toList();

        BigDecimal totalBudget = rows.stream().map(BudgetRow::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalActual = rows.stream().map(BudgetRow::actual).reduce(BigDecimal.ZERO, BigDecimal::add);

        return new BudgetStatus(period, totalBudget, totalActual,
                totalBudget.subtract(totalActual), rate(totalActual, totalBudget), rows);
    }

    @Transactional
    public BudgetRow createBudget(BudgetRequest req, String username) {
        YearMonth ym = parse(req.period());
        Account account = accountRepository.findById(req.accountId())
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + req.accountId()));
        budgetRepository.findByPeriodAndAccount_Id(req.period(), req.accountId()).ifPresent(b -> {
            throw ApiException.conflict(req.period() + " " + account.getName() + " 예산이 이미 편성되어 있습니다. 수정하세요.");
        });

        Budget b = budgetRepository.save(Budget.builder()
                .period(req.period())
                .account(account)
                .amount(req.amount())
                .remark(req.remark())
                .createdBy(username)
                .build());

        return toRow(b, actualsByAccount(ym).getOrDefault(account.getId(), BigDecimal.ZERO));
    }

    @Transactional
    public BudgetRow updateBudget(Long id, UpdateBudgetRequest req) {
        Budget b = budgetRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("예산을 찾을 수 없습니다. id=" + id));
        b.setAmount(req.amount());
        b.setRemark(req.remark());
        return toRow(b, actualsByAccount(parse(b.getPeriod())).getOrDefault(b.getAccount().getId(), BigDecimal.ZERO));
    }

    @Transactional
    public void deleteBudget(Long id) {
        Budget b = budgetRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("예산을 찾을 수 없습니다. id=" + id));
        budgetRepository.delete(b);
    }

    /**
     * 그 달의 계정별 집행실적.
     * 비용·자산은 차변이 증가, 수익·부채·자본은 대변이 증가다. 예산은 보통 비용에 잡지만,
     * 수익 예산(매출목표)도 같은 화면에서 보게 하려고 계정구분별 증가방향으로 집계한다.
     */
    private Map<Long, BigDecimal> actualsByAccount(YearMonth ym) {
        LocalDate from = ym.atDay(1);
        LocalDate to = ym.atEndOfMonth();

        Map<Long, BigDecimal> map = new HashMap<>();
        for (Object[] r : journalLineRepository.sumByAccount(from, to)) {
            Long accountId = (Long) r[0];
            AccountDivision division = (AccountDivision) r[3];
            BigDecimal debit = (BigDecimal) r[4];
            BigDecimal credit = (BigDecimal) r[5];
            boolean debitIncreases = division == AccountDivision.EXPENSE || division == AccountDivision.ASSET;
            map.put(accountId, debitIncreases ? debit.subtract(credit) : credit.subtract(debit));
        }
        return map;
    }

    private BudgetRow toRow(Budget b, BigDecimal actual) {
        BigDecimal remaining = b.getAmount().subtract(actual);
        return new BudgetRow(
                b.getId(), b.getPeriod(),
                b.getAccount().getId(), b.getAccount().getCode(), b.getAccount().getName(),
                b.getAccount().getDivision(),
                b.getAmount(), actual, remaining, rate(actual, b.getAmount()),
                remaining.signum() < 0,
                b.getRemark());
    }

    // ── 자금계획 ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public CashPlanStatus cashPlans(String period) {
        YearMonth ym = parse(period);
        List<CashPlan> plans = cashPlanRepository.findByPeriodOrderByTypeAscIdAsc(period);

        BigDecimal plannedIn = sumOf(plans, CashFlowType.INFLOW);
        BigDecimal plannedOut = sumOf(plans, CashFlowType.OUTFLOW);

        List<Object[]> actual = bankTransactionRepository.sumInOut(ym.atDay(1), ym.atEndOfMonth());
        BigDecimal actualIn = actual.isEmpty() ? BigDecimal.ZERO : (BigDecimal) actual.get(0)[0];
        BigDecimal actualOut = actual.isEmpty() ? BigDecimal.ZERO : (BigDecimal) actual.get(0)[1];

        List<CashPlanRow> rows = plans.stream()
                .map(p -> new CashPlanRow(p.getId(), p.getPeriod(), p.getType(), p.getType().getDisplayName(),
                        p.getCategory(), p.getAmount(), p.getRemark()))
                .toList();

        return new CashPlanStatus(period,
                plannedIn, plannedOut, plannedIn.subtract(plannedOut),
                actualIn, actualOut, actualIn.subtract(actualOut),
                actualIn.subtract(plannedIn), actualOut.subtract(plannedOut),
                rows);
    }

    @Transactional
    public CashPlanRow createCashPlan(CashPlanRequest req, String username) {
        parse(req.period());
        CashPlan p = cashPlanRepository.save(CashPlan.builder()
                .period(req.period())
                .type(req.type())
                .category(req.category())
                .amount(req.amount())
                .remark(req.remark())
                .createdBy(username)
                .build());
        return new CashPlanRow(p.getId(), p.getPeriod(), p.getType(), p.getType().getDisplayName(),
                p.getCategory(), p.getAmount(), p.getRemark());
    }

    @Transactional
    public void deleteCashPlan(Long id) {
        CashPlan p = cashPlanRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("자금계획을 찾을 수 없습니다. id=" + id));
        cashPlanRepository.delete(p);
    }

    private BigDecimal sumOf(List<CashPlan> plans, CashFlowType type) {
        return plans.stream()
                .filter(p -> p.getType() == type)
                .map(CashPlan::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // ── 공통 ──────────────────────────────────────────────────────────

    private BigDecimal rate(BigDecimal actual, BigDecimal budget) {
        if (budget == null || budget.signum() == 0) return BigDecimal.ZERO;
        return actual.multiply(HUNDRED).divide(budget, 1, RoundingMode.HALF_UP);
    }

    private YearMonth parse(String period) {
        try {
            return YearMonth.parse(period);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("귀속월 형식이 올바르지 않습니다(YYYY-MM): " + period);
        }
    }
}
