package com.erp.service;

import com.erp.domain.Expense;
import com.erp.domain.Project;
import com.erp.domain.Purchase;
import com.erp.domain.Sales;
import com.erp.dto.ProjectProfitDtos.ProjectProfitRow;
import com.erp.dto.ProjectProfitDtos.ProjectProfitSummary;
import com.erp.repository.ExpenseRepository;
import com.erp.repository.ProjectRepository;
import com.erp.repository.PurchaseRepository;
import com.erp.repository.SalesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 프로젝트별 손익. 전표에 붙은 프로젝트를 집계한다.
 *
 * <p>매출은 판매전표(공급가액), 원가는 구매전표(공급가액), 비용은 비용전표에서 모은다.
 * 부가세는 손익이 아니므로 제외한다(받아서 내는 돈이지 번 돈이 아니다).
 *
 * <p>프로젝트가 지정되지 않은 전표는 어느 프로젝트에도 넣지 않고 "미지정"으로 따로 보여준다.
 * 억지로 배분하면 프로젝트 손익이 거짓말을 한다.
 */
@Service
@RequiredArgsConstructor
public class ProjectProfitService {

    private final ProjectRepository projectRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final ExpenseRepository expenseRepository;

    @Transactional(readOnly = true)
    public ProjectProfitSummary profit(LocalDate from, LocalDate to) {
        LocalDate start = from != null ? from : LocalDate.now().withDayOfMonth(1);
        LocalDate end = to != null ? to : LocalDate.now();

        Map<Long, BigDecimal> revenue = new HashMap<>();
        Map<Long, Integer> salesCount = new HashMap<>();
        BigDecimal unassignedRevenue = BigDecimal.ZERO;

        for (Sales s : salesRepository.findAll()) {
            if (outOfRange(s.getSaleDate(), start, end)) continue;
            Project p = s.getProject();
            if (p == null) {
                unassignedRevenue = unassignedRevenue.add(s.getSupplyAmount());
                continue;
            }
            revenue.merge(p.getId(), s.getSupplyAmount(), BigDecimal::add);
            salesCount.merge(p.getId(), 1, Integer::sum);
        }

        Map<Long, BigDecimal> cost = new HashMap<>();
        Map<Long, Integer> purchaseCount = new HashMap<>();
        BigDecimal unassignedCost = BigDecimal.ZERO;

        for (Purchase p : purchaseRepository.findAll()) {
            if (outOfRange(p.getPurchaseDate(), start, end)) continue;
            Project prj = p.getProject();
            if (prj == null) {
                unassignedCost = unassignedCost.add(p.getSupplyAmount());
                continue;
            }
            cost.merge(prj.getId(), p.getSupplyAmount(), BigDecimal::add);
            purchaseCount.merge(prj.getId(), 1, Integer::sum);
        }

        Map<Long, BigDecimal> expense = new HashMap<>();
        Map<Long, Integer> expenseCount = new HashMap<>();

        for (Expense e : expenseRepository.findAll()) {
            if (outOfRange(e.getExpenseDate(), start, end)) continue;
            Project prj = e.getProject();
            if (prj == null) {
                unassignedCost = unassignedCost.add(e.getAmount());
                continue;
            }
            expense.merge(prj.getId(), e.getAmount(), BigDecimal::add);
            expenseCount.merge(prj.getId(), 1, Integer::sum);
        }

        List<ProjectProfitRow> rows = new ArrayList<>();
        BigDecimal totalRevenue = BigDecimal.ZERO;
        BigDecimal totalCost = BigDecimal.ZERO;

        for (Project p : projectRepository.findAll()) {
            BigDecimal rev = revenue.getOrDefault(p.getId(), BigDecimal.ZERO);
            BigDecimal pc = cost.getOrDefault(p.getId(), BigDecimal.ZERO);
            BigDecimal ex = expense.getOrDefault(p.getId(), BigDecimal.ZERO);
            BigDecimal profit = rev.subtract(pc).subtract(ex);

            // 매출이 0이면 이익률은 정의되지 않는다(0으로 나눌 수 없다). 0% 로 표시한다.
            BigDecimal margin = rev.signum() == 0
                    ? BigDecimal.ZERO
                    : profit.multiply(new BigDecimal("100")).divide(rev, 1, RoundingMode.HALF_UP);

            rows.add(new ProjectProfitRow(
                    p.getId(), p.getCode(), p.getName(),
                    p.getStatus() != null ? p.getStatus().getDisplayName() : null,
                    rev, pc, ex, profit, margin,
                    salesCount.getOrDefault(p.getId(), 0),
                    purchaseCount.getOrDefault(p.getId(), 0),
                    expenseCount.getOrDefault(p.getId(), 0)));

            totalRevenue = totalRevenue.add(rev);
            totalCost = totalCost.add(pc).add(ex);
        }

        rows.sort((a, b) -> b.profit().compareTo(a.profit()));

        return new ProjectProfitSummary(
                start, end,
                totalRevenue, totalCost, totalRevenue.subtract(totalCost),
                unassignedRevenue, unassignedCost,
                rows);
    }

    private boolean outOfRange(LocalDate date, LocalDate from, LocalDate to) {
        return date == null || date.isBefore(from) || date.isAfter(to);
    }
}
