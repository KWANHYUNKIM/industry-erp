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

    /**
     * 프로젝트계획/실적현황(E040637) — 2026-10-13 loginaa 실측.
     *
     * <p>원본 계획은 판매(수익) · 구매 · 노무비 · 경비(비용) 네 항목이고, 프로젝트 기간의 달에 놓인다
     * (20260901A: 판매 20,000,000 · 구매 10,000,000 → '2026.09' 한 줄씩). 우리 계획은 연 단위라
     * 프로젝트 시작달이 그 해이면 시작달에, 아니면 그 해 1월에 놓는다(원본 계획이 모두 한 달짜리 프로젝트라
     * 여러 달에 어떻게 나누는지는 아직 못 쟀다).
     *
     * <p>실적은 판매(공급가액) · 구매(공급가액) · 비용 전표를 그 달 · 그 프로젝트로 모은다(ProjectProfitService).
     * 노무비는 우리 전표에 프로젝트로 모을 자리가 없어 실적이 늘 비어 있다.
     */
    @Transactional(readOnly = true)
    public List<com.erp.accounting.project.dto.ProjectPlanDtos.StatusCell> status(
            List<Long> projectIds, java.time.YearMonth from, java.time.YearMonth to) {
        if (projectIds == null || projectIds.isEmpty()) return List.of();
        if (to.isBefore(from)) { java.time.YearMonth t = from; from = to; to = t; }
        if (from.plusMonths(120).isBefore(to)) throw ApiException.badRequest("기준일자는 10년 안으로 고르세요.");

        java.util.Set<Long> ids = new java.util.LinkedHashSet<>(projectIds);
        java.util.Map<Long, Project> projects = new java.util.LinkedHashMap<>();
        for (Project p : projectRepository.findAllById(ids)) projects.put(p.getId(), p);

        // (프로젝트, 항목, 달) → [예상, 실적]
        java.util.Map<String, BigDecimal[]> cells = new java.util.LinkedHashMap<>();
        java.util.function.BiConsumer<String, BigDecimal[]> put = (k, v) -> cells.merge(k, v,
                (a, b) -> new BigDecimal[]{a[0].add(b[0]), a[1].add(b[1])});

        for (ProjectPlan plan : planRepository.findByProjectIdsWithProject(ids)) {
            Project p = plan.getProject();
            java.time.YearMonth ym = (p.getStartDate() != null && p.getStartDate().getYear() == plan.getPlanYear())
                    ? java.time.YearMonth.from(p.getStartDate())
                    : java.time.YearMonth.of(plan.getPlanYear(), 1);
            if (ym.isBefore(from) || ym.isAfter(to)) continue;
            putPlan(put, p.getId(), "판매", ym, plan.getPlanRevenue());
            putPlan(put, p.getId(), "구매", ym, plan.getPlanPurchase());
            putPlan(put, p.getId(), "노무비", ym, plan.getPlanLabor());
            putPlan(put, p.getId(), "경비", ym, plan.getPlanExpense());
        }

        for (java.time.YearMonth ym = from; !ym.isAfter(to); ym = ym.plusMonths(1)) {
            ProjectProfitSummary s = projectProfitService.profit(ym.atDay(1), ym.atEndOfMonth());
            for (ProjectProfitRow r : s.rows()) {
                if (!ids.contains(r.projectId())) continue;
                putActual(put, r.projectId(), "판매", ym, r.revenue());
                putActual(put, r.projectId(), "구매", ym, r.purchaseCost());
                putActual(put, r.projectId(), "경비", ym, r.expense());
            }
        }

        List<com.erp.accounting.project.dto.ProjectPlanDtos.StatusCell> out = new java.util.ArrayList<>();
        for (var e : cells.entrySet()) {
            String[] k = e.getKey().split("\\|");
            Project p = projects.get(Long.valueOf(k[0]));
            if (p == null) continue;
            out.add(new com.erp.accounting.project.dto.ProjectPlanDtos.StatusCell(
                    p.getId(), p.getCode(), p.getName(), p.getStartDate(), p.getEndDate(),
                    k[1], k[2], e.getValue()[0], e.getValue()[1]));
        }
        out.sort(java.util.Comparator
                .comparing(com.erp.accounting.project.dto.ProjectPlanDtos.StatusCell::projectCode)
                .thenComparing(c -> ITEM_ORDER.indexOf(c.item()))
                .thenComparing(com.erp.accounting.project.dto.ProjectPlanDtos.StatusCell::month));
        return out;
    }

    private static final List<String> ITEM_ORDER = List.of("판매", "구매", "노무비", "경비");

    private static void putPlan(java.util.function.BiConsumer<String, BigDecimal[]> put,
                                Long projectId, String item, java.time.YearMonth ym, BigDecimal v) {
        if (v == null || v.signum() == 0) return;
        put.accept(projectId + "|" + item + "|" + ym, new BigDecimal[]{v, BigDecimal.ZERO});
    }

    private static void putActual(java.util.function.BiConsumer<String, BigDecimal[]> put,
                                  Long projectId, String item, java.time.YearMonth ym, BigDecimal v) {
        if (v == null || v.signum() == 0) return;
        put.accept(projectId + "|" + item + "|" + ym, new BigDecimal[]{BigDecimal.ZERO, v});
    }

    /** 달성률(%) = 실적/계획*100. 계획이 0 이하이면 0으로 둔다(나눗셈·음수 왜곡 방지). */
    private BigDecimal rate(BigDecimal actual, BigDecimal plan) {
        if (plan == null || plan.signum() <= 0) return BigDecimal.ZERO;
        return actual.multiply(BigDecimal.valueOf(100)).divide(plan, 1, RoundingMode.HALF_UP);
    }
}
