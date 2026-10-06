package com.erp.accounting.project;

import com.erp.accounting.project.dto.ProjectPlanDtos.ComparisonRow;
import com.erp.accounting.project.dto.ProjectPlanDtos.CreateProjectPlanRequest;
import com.erp.accounting.project.dto.ProjectPlanDtos.ProjectPlanResponse;
import com.erp.accounting.project.dto.ProjectProfitDtos.ProjectProfitRow;
import com.erp.accounting.project.dto.ProjectProfitDtos.ProjectProfitSummary;
import com.erp.common.ApiException;
import com.erp.inventory.project.Project;
import com.erp.inventory.project.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProjectPlanService {

    private final ProjectPlanRepository planRepository;
    private final ProjectRepository projectRepository;
    private final ProjectProfitService projectProfitService;

    @Transactional(readOnly = true)
    public List<ProjectPlanResponse> findAll(Integer year) {
        List<ProjectPlan> rows = (year != null)
                ? planRepository.findByYearWithProject(year)
                : planRepository.findAllWithProject();
        return rows.stream().map(ProjectPlanResponse::from).toList();
    }

    @Transactional
    public ProjectPlanResponse create(CreateProjectPlanRequest req, String username) {
        Project project = projectRepository.findById(req.projectId())
                .orElseThrow(() -> ApiException.notFound("프로젝트를 찾을 수 없습니다. id=" + req.projectId()));
        /* 원본 격자의 [구매]·[노무비]·[경비] — 안 주면 0 이다(엔티티 기본값과 같게 둔다). */
        BigDecimal purchase = req.planPurchase() != null ? req.planPurchase() : BigDecimal.ZERO;
        BigDecimal labor = req.planLabor() != null ? req.planLabor() : BigDecimal.ZERO;
        BigDecimal expense = req.planExpense() != null ? req.planExpense() : BigDecimal.ZERO;
        /*
         * 계획원가는 그 셋의 합계다(화면 주석). 목록은 [구매]·[노무비]·[경비] 만 보여 주고
         * 계획이익은 계획매출 − 계획원가로 내는데, 셋만 적고 계획원가를 비우면 원가 0 으로 읽혀
         * <b>계획이익 = 계획매출</b>(이익률 100%)이 됐다. 비웠으면 셋의 합으로 채운다 —
         * 따로 적었으면 그 값을 존중한다.
         */
        BigDecimal cost = req.planCost();
        if (cost.signum() == 0) cost = purchase.add(labor).add(expense);
        ProjectPlan plan = ProjectPlan.builder()
                .project(project)
                .planYear(req.planYear())
                .planRevenue(req.planRevenue())
                .planCost(cost)
                .planPurchase(purchase)
                .planLabor(labor)
                .planExpense(expense)
                .remark(req.remark())
                .createdBy(username)
                .build();
        return ProjectPlanResponse.from(planRepository.save(plan));
    }

    @Transactional
    public void delete(Long id) {
        ProjectPlan plan = planRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트계획을 찾을 수 없습니다. id=" + id));
        planRepository.delete(plan);
    }

    /** 계획 vs 실적(해당 연도 전표 집계) 대조. 실적은 프로젝트별 손익에서 가져온다. */
    @Transactional(readOnly = true)
    public List<ComparisonRow> comparison(int year) {
        List<ProjectPlan> plans = planRepository.findByYearWithProject(year);

        ProjectProfitSummary actual = projectProfitService.profit(
                LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
        Map<Long, ProjectProfitRow> actualByProject = actual.rows().stream()
                .collect(Collectors.toMap(ProjectProfitRow::projectId, Function.identity()));

        return plans.stream().map(p -> {
            BigDecimal planRevenue = p.getPlanRevenue();
            BigDecimal planCost = p.getPlanCost();
            BigDecimal planProfit = planRevenue.subtract(planCost);

            ProjectProfitRow a = actualByProject.get(p.getProject().getId());
            BigDecimal actRevenue = a != null ? a.revenue() : BigDecimal.ZERO;
            BigDecimal actCost = a != null ? a.purchaseCost().add(a.expense()) : BigDecimal.ZERO;
            BigDecimal actProfit = a != null ? a.profit() : BigDecimal.ZERO;

            return new ComparisonRow(
                    p.getId(), p.getPlanYear(),
                    p.getProject().getId(), p.getProject().getCode(), p.getProject().getName(),
                    planRevenue, planCost, planProfit,
                    actRevenue, actCost, actProfit,
                    rate(actRevenue, planRevenue), rate(actProfit, planProfit),
                    p.getPlanPurchase(), p.getPlanLabor(), p.getPlanExpense(),
                    p.getProject().getStartDate(), p.getProject().getEndDate(), p.getRemark(),
                    p.getUpdatedAt());
        }).toList();
    }

    /** 달성률(%) = 실적/계획*100. 계획이 0 이하이면 0으로 둔다(나눗셈·음수 왜곡 방지). */
    private BigDecimal rate(BigDecimal actual, BigDecimal plan) {
        if (plan == null || plan.signum() <= 0) return BigDecimal.ZERO;
        return actual.multiply(BigDecimal.valueOf(100)).divide(plan, 1, RoundingMode.HALF_UP);
    }
}
