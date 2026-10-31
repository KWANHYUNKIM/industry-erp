package com.erp.accounting.fund.budget;

import com.erp.common.ApiException;
import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.ledger.account.AccountDivision;
import com.erp.accounting.fund.cash.CashPlan;
import com.erp.accounting.fund.cash.CashFlowType;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetAccountDetail;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetAccountRow;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetActualLine;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetLineRequest;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetPlanLine;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetReport;
import com.erp.accounting.fund.budget.dto.BudgetDtos.BudgetReportPlan;
import com.erp.accounting.fund.budget.dto.BudgetDtos.DeleteBudgetRequest;
import com.erp.accounting.fund.budget.dto.BudgetDtos.SaveBudgetRequest;
import com.erp.accounting.fund.budget.dto.BudgetDtos.CashPlanRequest;
import com.erp.accounting.fund.budget.dto.BudgetDtos.CashPlanRow;
import com.erp.accounting.fund.budget.dto.BudgetDtos.CashPlanStatus;
import com.erp.accounting.ledger.account.AccountRepository;
import com.erp.accounting.fund.bankcard.BankTransactionRepository;
import com.erp.accounting.fund.cash.CashPlanRepository;
import com.erp.accounting.ledger.journal.JournalLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Objects;
import java.util.List;
import java.util.Map;
import com.erp.accounting.fund.budget.dto.BudgetDtos;

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

    private final BudgetPlanRepository budgetPlanRepository;
    private final CashPlanRepository cashPlanRepository;
    private final AccountRepository accountRepository;
    private final JournalLineRepository journalLineRepository;
    private final BankTransactionRepository bankTransactionRepository;

    // ── 예산관리 ──────────────────────────────────────────────────────

    /** 월별예산조회 목록 — 그 해 예산이 한 줄이라도 있는 계정, 계정코드 차례. */
    @Transactional(readOnly = true)
    public List<BudgetAccountRow> budgetAccounts(int year) {
        Map<Long, BudgetAccountRow> map = new LinkedHashMap<>();
        for (BudgetPlan b : budgetPlanRepository.findInYearsWithAccount(year, year)) {
            Account a = b.getAccount();
            BudgetAccountRow cur = map.get(a.getId());
            BigDecimal sum = (cur == null ? BigDecimal.ZERO : cur.total()).add(b.total());
            map.put(a.getId(), new BudgetAccountRow(a.getId(), a.getCode(), a.getName(), a.getDivision(), sum));
        }
        return new ArrayList<>(map.values());
    }

    /** 예산입력 창 — 계정 하나의 부서 × 프로젝트 줄. */
    @Transactional(readOnly = true)
    public BudgetAccountDetail budgetAccount(int year, Long accountId) {
        Account a = accountRepository.findById(accountId)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + accountId));
        List<BudgetPlanLine> lines = budgetPlanRepository.findByYearAndAccount(year, accountId).stream()
                .map(this::toLine).toList();
        return new BudgetAccountDetail(year, a.getId(), a.getCode(), a.getName(), lines);
    }

    /**
     * 예산입력 [저장(F8)] — 줄마다 id 가 있으면 고치고 없으면 더한다. 같은 부서 × 프로젝트 줄이 이미 있으면 그 줄을 고친다.
     * 금액이 모두 0 인 새 줄(손대지 않은 빈 줄)은 넣지 않는다. 고쳐서 0 이 된 줄은 남는다(원본 실측).
     */
    @Transactional
    public BudgetAccountDetail saveBudgetAccount(SaveBudgetRequest req) {
        Account a = accountRepository.findById(req.accountId())
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + req.accountId()));
        List<BudgetPlan> existing = budgetPlanRepository.findByYearAndAccount(req.year(), req.accountId());
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (BudgetLineRequest l : req.lines()) {
            String key = l.departmentId() + "/" + l.projectId();
            if (!seen.add(key)) {
                throw ApiException.badRequest("같은 부서 · 프로젝트의 예산이 두 줄입니다.");
            }
            BudgetPlan target = null;
            if (l.id() != null) {
                target = existing.stream().filter(b -> b.getId().equals(l.id())).findFirst()
                        .orElseThrow(() -> ApiException.notFound("예산을 찾을 수 없습니다. id=" + l.id()));
            } else {
                target = existing.stream().filter(b -> Objects.equals(b.getDepartmentId(), l.departmentId())
                        && Objects.equals(b.getProjectId(), l.projectId())).findFirst().orElse(null);
            }
            if (target == null) {
                if (l.months().stream().allMatch(m -> m.signum() == 0)) continue;
                target = BudgetPlan.builder().fiscalYear(req.year()).account(a).build();
                existing.add(target);
            }
            target.setDepartmentId(l.departmentId());
            target.setProjectId(l.projectId());
            target.setRemark(l.remark() == null || l.remark().isBlank() ? null : l.remark().trim());
            target.setMonths(l.months());
            budgetPlanRepository.save(target);
        }
        budgetPlanRepository.flush();
        return budgetAccount(req.year(), req.accountId());
    }

    /** 목록 [선택삭제] — 고른 계정의 그 해 예산 줄을 모두 지운다. */
    @Transactional
    public void deleteBudgetAccounts(DeleteBudgetRequest req) {
        budgetPlanRepository.deleteAll(budgetPlanRepository.findByYearAndAccounts(req.year(), req.accountIds()));
    }

    /**
     * 출력물 다섯(예산현황 · 예산-실적비교표 · 통제예산-실적대장 · 예산-실적대장 · 통제예산-실적비교표)이 같이 쓰는 자료.
     * 해 구간의 예산 줄과, 그 계정들의 전표 실적 줄(그 구간 1/1 ~ 12/31). 부서 · 프로젝트 · 달 구간은 화면이 거른다.
     */
    @Transactional(readOnly = true)
    public BudgetReport budgetReport(int fromYear, int toYear) {
        List<BudgetPlan> plans = budgetPlanRepository.findInYearsWithAccount(fromYear, toYear);
        List<BudgetReportPlan> planRows = plans.stream().map(b -> new BudgetReportPlan(b.getFiscalYear(),
                b.getAccount().getId(), b.getAccount().getCode(), b.getAccount().getName(),
                b.getDepartmentId(), b.getProjectId(), b.months())).toList();
        java.util.Set<Long> accountIds = new java.util.LinkedHashSet<>();
        plans.forEach(b -> accountIds.add(b.getAccount().getId()));
        List<BudgetActualLine> actuals = new ArrayList<>();
        if (!accountIds.isEmpty()) {
            for (Object[] r : journalLineRepository.budgetActualLines(
                    LocalDate.of(fromYear, 1, 1), LocalDate.of(toYear, 12, 31), accountIds)) {
                AccountDivision division = (AccountDivision) r[6];
                BigDecimal debit = r[7] == null ? BigDecimal.ZERO : (BigDecimal) r[7];
                BigDecimal credit = r[8] == null ? BigDecimal.ZERO : (BigDecimal) r[8];
                boolean debitIncreases = division == AccountDivision.EXPENSE || division == AccountDivision.ASSET;
                actuals.add(new BudgetActualLine((Long) r[0], (LocalDate) r[1], (String) r[2], (String) r[3],
                        (String) r[4], (Long) r[5], debitIncreases ? debit.subtract(credit) : credit.subtract(debit),
                        (Long) r[9], (Long) r[10]));
            }
        }
        return new BudgetReport(planRows, actuals);
    }

    private BudgetPlanLine toLine(BudgetPlan b) {
        return new BudgetPlanLine(b.getId(), b.getDepartmentId(), b.getProjectId(), b.getRemark(), b.months(), b.total());
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

    private YearMonth parse(String period) {
        try {
            return YearMonth.parse(period);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("귀속월 형식이 올바르지 않습니다(YYYY-MM): " + period);
        }
    }
}
