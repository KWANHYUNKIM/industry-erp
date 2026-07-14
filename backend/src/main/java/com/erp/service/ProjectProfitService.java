package com.erp.service;

import com.erp.domain.Project;
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
import java.util.function.Function;

/**
 * 프로젝트별 손익. 전표에 붙은 프로젝트를 집계한다.
 *
 * <p>매출은 판매전표(공급가액), 원가는 구매전표(공급가액), 비용은 비용전표에서 모은다.
 * 부가세는 손익이 아니므로 제외한다(받아서 내는 돈이지 번 돈이 아니다).
 *
 * <p>프로젝트가 지정되지 않은 전표는 어느 프로젝트에도 넣지 않고 "미지정"으로 따로 보여준다.
 * 억지로 배분하면 프로젝트 손익이 거짓말을 한다.
 *
 * <p>집계는 DB 에서 group by 로 한 번에 한다. 전표를 전부 읽어 자바에서 묶으면 LAZY 인
 * project 를 행마다 건드려 전표 수만큼 쿼리가 나간다(N+1).
 */
@Service
@RequiredArgsConstructor
public class ProjectProfitService {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private final ProjectRepository projectRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final ExpenseRepository expenseRepository;

    @Transactional(readOnly = true)
    public ProjectProfitSummary profit(LocalDate from, LocalDate to) {
        LocalDate start = from != null ? from : LocalDate.now().withDayOfMonth(1);
        LocalDate end = to != null ? to : LocalDate.now();

        // 집계 쿼리는 전표 종류마다 한 번씩만 부른다 (금액·건수를 같은 결과에서 뽑는다).
        List<SalesRepository.ProjectAmount> salesAgg = salesRepository.sumSupplyByProject(start, end);
        Map<Long, BigDecimal> revenue = amounts(salesAgg,
                SalesRepository.ProjectAmount::getProjectId, SalesRepository.ProjectAmount::getAmount);
        Map<Long, Long> salesCount = counts(salesAgg,
                SalesRepository.ProjectAmount::getProjectId, SalesRepository.ProjectAmount::getCount);

        List<PurchaseRepository.ProjectAmount> purchaseAgg = purchaseRepository.sumSupplyByProject(start, end);
        Map<Long, BigDecimal> cost = amounts(purchaseAgg,
                PurchaseRepository.ProjectAmount::getProjectId, PurchaseRepository.ProjectAmount::getAmount);
        Map<Long, Long> purchaseCount = counts(purchaseAgg,
                PurchaseRepository.ProjectAmount::getProjectId, PurchaseRepository.ProjectAmount::getCount);

        List<ExpenseRepository.ProjectAmount> expenseAgg = expenseRepository.sumByProject(start, end);
        Map<Long, BigDecimal> expense = amounts(expenseAgg,
                ExpenseRepository.ProjectAmount::getProjectId, ExpenseRepository.ProjectAmount::getAmount);
        Map<Long, Long> expenseCount = counts(expenseAgg,
                ExpenseRepository.ProjectAmount::getProjectId, ExpenseRepository.ProjectAmount::getCount);

        BigDecimal unassignedRevenue = salesRepository.sumSupplyWithoutProject(start, end);
        BigDecimal unassignedCost = purchaseRepository.sumSupplyWithoutProject(start, end)
                .add(expenseRepository.sumWithoutProject(start, end));

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
                    : profit.multiply(HUNDRED).divide(rev, 1, RoundingMode.HALF_UP);

            rows.add(new ProjectProfitRow(
                    p.getId(), p.getCode(), p.getName(),
                    p.getStatus() != null ? p.getStatus().getDisplayName() : null,
                    rev, pc, ex, profit, margin,
                    salesCount.getOrDefault(p.getId(), 0L).intValue(),
                    purchaseCount.getOrDefault(p.getId(), 0L).intValue(),
                    expenseCount.getOrDefault(p.getId(), 0L).intValue()));

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

    private <T> Map<Long, BigDecimal> amounts(List<T> rows, Function<T, Long> key, Function<T, BigDecimal> value) {
        Map<Long, BigDecimal> map = new HashMap<>();
        for (T row : rows) map.put(key.apply(row), value.apply(row));
        return map;
    }

    private <T> Map<Long, Long> counts(List<T> rows, Function<T, Long> key, Function<T, Long> value) {
        Map<Long, Long> map = new HashMap<>();
        for (T row : rows) map.put(key.apply(row), value.apply(row));
        return map;
    }
}
