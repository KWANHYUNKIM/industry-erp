package com.erp.accounting.service;

import com.erp.accounting.domain.ProjectPlan;
import com.erp.accounting.dto.ProjectPlanDtos.ComparisonRow;
import com.erp.accounting.dto.ProjectPlanDtos.CreateProjectPlanRequest;
import com.erp.accounting.dto.ProjectPlanDtos.ProjectPlanResponse;
import com.erp.accounting.dto.ProjectProfitDtos.ProjectProfitRow;
import com.erp.accounting.dto.ProjectProfitDtos.ProjectProfitSummary;
import com.erp.accounting.repository.ProjectPlanRepository;
import com.erp.common.ApiException;
import com.erp.inventory.domain.Project;
import com.erp.inventory.repository.ProjectRepository;
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
        ProjectPlan plan = ProjectPlan.builder()
                .project(project)
                .planYear(req.planYear())
                .planRevenue(req.planRevenue())
                .planCost(req.planCost())
                /* 원본 격자의 [구매]·[노무비]·[경비] — 안 주면 0 이다(엔티티 기본값과 같게 둔다). */
                .planPurchase(req.planPurchase() != null ? req.planPurchase() : BigDecimal.ZERO)
                .planLabor(req.planLabor() != null ? req.planLabor() : BigDecimal.ZERO)
                .planExpense(req.planExpense() != null ? req.planExpense() : BigDecimal.ZERO)
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
                    p.getProject().getStartDate(), p.getProject().getEndDate(), p.getRemark());
        }).toList();
    }

    /** 달성률(%) = 실적/계획*100. 계획이 0 이하이면 0으로 둔다(나눗셈·음수 왜곡 방지). */
    private BigDecimal rate(BigDecimal actual, BigDecimal plan) {
        if (plan == null || plan.signum() <= 0) return BigDecimal.ZERO;
        return actual.multiply(BigDecimal.valueOf(100)).divide(plan, 1, RoundingMode.HALF_UP);
    }
}
