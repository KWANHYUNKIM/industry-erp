package com.erp.accounting.project;

import com.erp.accounting.project.dto.ProjectPlanDtos.ComparisonRow;
import com.erp.accounting.project.dto.ProjectPlanDtos.CreateProjectPlanRequest;
import com.erp.accounting.project.dto.ProjectPlanDtos.MonthAmount;
import com.erp.accounting.project.dto.ProjectPlanDtos.ProjectPlanLineRequest;
import com.erp.accounting.project.dto.ProjectPlanDtos.ProjectPlanLineResponse;
import com.erp.accounting.project.dto.ProjectPlanDtos.ProjectPlanResponse;
import com.erp.accounting.project.dto.ProjectPlanDtos.StatusCell;
import com.erp.accounting.project.dto.ProjectProfitDtos.ProjectProfitRow;
import com.erp.accounting.project.dto.ProjectProfitDtos.ProjectProfitSummary;
import com.erp.common.ApiException;
import com.erp.inventory.project.Project;
import com.erp.inventory.project.ProjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 프로젝트계획조회(E040636) · 프로젝트계획/실적현황(E040637) — 2026-10-14 loginaa 실측(plans/재고2/E040636.md).
 *
 * <p>원본 계획 모델: 계획 머리(프로젝트 · 시작일 · 완료일 · 적요) + 항목(01 판매 · 02 구매 · 03 노무비 · 04 경비)마다
 * 계획 줄(적요 · 금액 · 달별 금액) 여러 개. 목록 금액 열은 그 항목 줄들의 [금액] 합이고,
 * 실적현황 예상금액은 달별 금액이다(둘은 따로 저장된다).
 */
@Service
@RequiredArgsConstructor
public class ProjectPlanService {

    private final ProjectPlanRepository planRepository;
    private final ProjectPlanLineRepository lineRepository;
    private final ProjectService projectService;
    private final ProjectProfitService projectProfitService;

    /** 원본 항목코드 → 실적현황 항목 글자. */
    private static final Map<String, String> ITEM_NAME = Map.of("01", "판매", "02", "구매", "03", "노무비", "04", "경비");
    private static final List<String> ITEM_ORDER = List.of("판매", "구매", "노무비", "경비");

    @Transactional(readOnly = true)
    public List<ProjectPlanResponse> findAll(Integer year) {
        List<ProjectPlan> rows = (year != null)
                ? planRepository.findByYearWithProject(year)
                : planRepository.findAllWithProject();
        return rows.stream().map(ProjectPlanResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ProjectPlanResponse get(Long id) {
        return ProjectPlanResponse.from(plan(id));
    }

    @Transactional
    public ProjectPlanResponse create(CreateProjectPlanRequest req, String username) {
        checkPeriod(req.startDate(), req.endDate());
        Project project = projectService.get(req.projectId());
        ProjectPlan plan = ProjectPlan.builder()
                .project(project)
                .planYear(req.startDate().getYear())
                .startDate(req.startDate())
                .endDate(req.endDate())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return ProjectPlanResponse.from(planRepository.save(plan));
    }

    /** 원본 [프로젝트 계획항목 수정] 창의 저장(F8). 항목 계획 줄은 그대로 둔다. */
    @Transactional
    public ProjectPlanResponse update(Long id, CreateProjectPlanRequest req) {
        checkPeriod(req.startDate(), req.endDate());
        ProjectPlan plan = plan(id);
        if (!plan.getProject().getId().equals(req.projectId())) plan.setProject(projectService.get(req.projectId()));
        plan.setStartDate(req.startDate());
        plan.setEndDate(req.endDate());
        plan.setPlanYear(req.startDate().getYear());
        plan.setRemark(req.remark());
        return ProjectPlanResponse.from(plan);
    }

    /** 수정 창 [삭제] — 항목 계획 줄 · 달 칸도 같이 사라진다(원본 실측, DB 는 ON DELETE CASCADE). */
    @Transactional
    public void delete(Long id) {
        ProjectPlan plan = plan(id);
        lineRepository.deleteAll(lineRepository.findByPlanId(id));
        planRepository.delete(plan);
    }

    // ---- 항목 계획 줄 — '<이름> [<코드>] <항목> 계획 리스트' · '… 계획 입력' 창 ----

    @Transactional(readOnly = true)
    public List<ProjectPlanLineResponse> lines(Long planId, String itemCode) {
        plan(planId);
        return lineRepository.findByPlanIdWithMonths(planId).stream()
                .filter(l -> itemCode == null || itemCode.equals(l.getItemCode()))
                .map(ProjectPlanLineResponse::from).toList();
    }

    @Transactional
    public ProjectPlanLineResponse addLine(Long planId, ProjectPlanLineRequest req) {
        ProjectPlan plan = plan(planId);
        ProjectPlanLine line = ProjectPlanLine.builder().plan(plan).itemCode(req.itemCode()).build();
        fill(line, req);
        lineRepository.save(line);
        resum(plan);
        return ProjectPlanLineResponse.from(line);
    }

    @Transactional
    public ProjectPlanLineResponse updateLine(Long lineId, ProjectPlanLineRequest req) {
        ProjectPlanLine line = line(lineId);
        fill(line, req);
        resum(line.getPlan());
        return ProjectPlanLineResponse.from(line);
    }

    @Transactional
    public void deleteLine(Long lineId) {
        ProjectPlanLine line = line(lineId);
        ProjectPlan plan = line.getPlan();
        lineRepository.delete(line);
        lineRepository.flush();
        resum(plan);
    }

    private void fill(ProjectPlanLine line, ProjectPlanLineRequest req) {
        ProjectPlan plan = line.getPlan();
        YearMonth first = YearMonth.from(plan.getStartDate());
        YearMonth last = YearMonth.from(plan.getEndDate());
        line.setRemark(req.remark());
        line.setAmount(req.amount() != null ? req.amount() : BigDecimal.ZERO);
        Map<String, BigDecimal> want = new LinkedHashMap<>();
        for (MonthAmount m : req.months() == null ? List.<MonthAmount>of() : req.months()) {
            YearMonth ym = YearMonth.parse(m.ym());
            if (ym.isBefore(first) || ym.isAfter(last)) throw ApiException.badRequest("계획 기간 밖의 달입니다. " + m.ym());
            want.put(m.ym(), m.amount() != null ? m.amount() : BigDecimal.ZERO);
        }
        line.getMonths().removeIf(m -> !want.containsKey(m.getYm()));
        for (ProjectPlanLineMonth m : line.getMonths()) m.setAmount(want.remove(m.getYm()));
        want.forEach((ym, amt) -> line.getMonths().add(ProjectPlanLineMonth.builder().line(line).ym(ym).amount(amt).build()));
        line.getMonths().sort(Comparator.comparing(ProjectPlanLineMonth::getYm));
    }

    /** 계획 머리의 네 항목 금액 = 그 항목 줄 [금액] 의 합(목록 [판매] · [구매] · [노무비] · [경비]). */
    private void resum(ProjectPlan plan) {
        Map<String, BigDecimal> sum = new HashMap<>();
        for (ProjectPlanLine l : lineRepository.findByPlanId(plan.getId())) sum.merge(l.getItemCode(), l.getAmount(), BigDecimal::add);
        plan.setPlanRevenue(sum.getOrDefault("01", BigDecimal.ZERO));
        plan.setPlanPurchase(sum.getOrDefault("02", BigDecimal.ZERO));
        plan.setPlanLabor(sum.getOrDefault("03", BigDecimal.ZERO));
        plan.setPlanExpense(sum.getOrDefault("04", BigDecimal.ZERO));
        plan.setPlanCost(plan.getPlanPurchase().add(plan.getPlanLabor()).add(plan.getPlanExpense()));
    }

    private ProjectPlan plan(Long id) {
        return planRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("프로젝트계획을 찾을 수 없습니다. id=" + id));
    }

    private ProjectPlanLine line(Long id) {
        return lineRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계획을 찾을 수 없습니다. id=" + id));
    }

    private static void checkPeriod(LocalDate start, LocalDate end) {
        if (end.isBefore(start)) throw ApiException.badRequest("완료일이 시작일보다 빠릅니다.");
        if (YearMonth.from(start).plusMonths(120).isBefore(YearMonth.from(end)))
            throw ApiException.badRequest("계획 기간은 10년 안으로 넣으세요.");
    }

    /** 프로젝트계획 리스트 — 계획 vs 실적(계획 연도의 전표 집계). */
    @Transactional(readOnly = true)
    public List<ComparisonRow> comparison(Integer year) {
        List<ProjectPlan> plans = year != null
                ? planRepository.findByYearWithProject(year)
                : planRepository.findAllWithProject();

        Map<Integer, Map<Long, ProjectProfitRow>> actualByYear = new HashMap<>();
        for (Integer y : plans.stream().map(ProjectPlan::getPlanYear).distinct().toList()) {
            ProjectProfitSummary actual = projectProfitService.profit(LocalDate.of(y, 1, 1), LocalDate.of(y, 12, 31));
            actualByYear.put(y, actual.rows().stream()
                    .collect(Collectors.toMap(ProjectProfitRow::projectId, Function.identity())));
        }

        return plans.stream().map(p -> {
            Map<Long, ProjectProfitRow> actualByProject = actualByYear.getOrDefault(p.getPlanYear(), Map.of());
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
                    p.getStartDate(), p.getEndDate(), p.getRemark(),
                    p.getUpdatedAt());
        }).toList();
    }

    /**
     * 프로젝트계획/실적현황(E040637) — 2026-10-14 loginaa 실측.
     *
     * <p>예상금액은 항목 계획 줄의 <b>달별 금액</b>이다. 계획이 있는 항목은 <b>계획 기간 안의 달마다 줄이 선다</b>
     * (값이 없어도 — 원본 2026/10/14 ~ 12/31 계획, 10월 100,000 · 11월 200,000 → 2026.12 빈 줄),
     * 계획 기간 밖의 달은 줄이 없다(한 달짜리 계획을 1년으로 검색하면 그 달 한 줄).
     *
     * <p>실적은 판매(공급가액) · 구매(공급가액) · 비용 전표를 그 달 · 그 프로젝트로 모은다(ProjectProfitService).
     * 노무비는 우리 전표에 프로젝트로 모을 자리가 없어 실적이 늘 비어 있다.
     */
    @Transactional(readOnly = true)
    public List<StatusCell> status(List<Long> projectIds, YearMonth from, YearMonth to) {
        if (projectIds == null || projectIds.isEmpty()) return List.of();
        if (to.isBefore(from)) { YearMonth t = from; from = to; to = t; }
        if (from.plusMonths(120).isBefore(to)) throw ApiException.badRequest("기준일자는 10년 안으로 고르세요.");

        Set<Long> ids = new LinkedHashSet<>(projectIds);
        Map<Long, Project> projects = new LinkedHashMap<>();
        for (Long id : ids) projects.put(id, projectService.get(id));

        // (프로젝트, 항목, 달) → [예상, 실적]
        Map<String, BigDecimal[]> cells = new LinkedHashMap<>();

        List<ProjectPlan> plans = planRepository.findByProjectIdsWithProject(ids);
        Map<Long, List<ProjectPlanLine>> linesByPlan = plans.isEmpty() ? Map.of()
                : lineRepository.findByPlanIdsWithMonths(plans.stream().map(ProjectPlan::getId).toList()).stream()
                .collect(Collectors.groupingBy(l -> l.getPlan().getId()));
        for (ProjectPlan plan : plans) {
            YearMonth a = YearMonth.from(plan.getStartDate());
            YearMonth b = YearMonth.from(plan.getEndDate());
            if (a.isBefore(from)) a = from;
            if (b.isAfter(to)) b = to;
            Long pid = plan.getProject().getId();
            for (ProjectPlanLine l : linesByPlan.getOrDefault(plan.getId(), List.of())) {
                String item = ITEM_NAME.get(l.getItemCode());
                Map<String, BigDecimal> byYm = new HashMap<>();
                for (ProjectPlanLineMonth m : l.getMonths()) byYm.merge(m.getYm(), m.getAmount(), BigDecimal::add);
                for (YearMonth ym = a; !ym.isAfter(b); ym = ym.plusMonths(1)) {
                    BigDecimal v = byYm.getOrDefault(ym.toString(), BigDecimal.ZERO);
                    cells.merge(pid + "|" + item + "|" + ym, new BigDecimal[]{v, BigDecimal.ZERO},
                            (x, y) -> new BigDecimal[]{x[0].add(y[0]), x[1].add(y[1])});
                }
            }
        }

        for (YearMonth ym = from; !ym.isAfter(to); ym = ym.plusMonths(1)) {
            ProjectProfitSummary s = projectProfitService.profit(ym.atDay(1), ym.atEndOfMonth());
            for (ProjectProfitRow r : s.rows()) {
                if (!ids.contains(r.projectId())) continue;
                putActual(cells, r.projectId(), "판매", ym, r.revenue());
                putActual(cells, r.projectId(), "구매", ym, r.purchaseCost());
                putActual(cells, r.projectId(), "경비", ym, r.expense());
            }
        }

        List<StatusCell> out = new ArrayList<>();
        for (var e : cells.entrySet()) {
            String[] k = e.getKey().split("\\|");
            Project p = projects.get(Long.valueOf(k[0]));
            if (p == null) continue;
            out.add(new StatusCell(p.getId(), p.getCode(), p.getName(), p.getStartDate(), p.getEndDate(),
                    k[1], k[2], e.getValue()[0], e.getValue()[1]));
        }
        out.sort(Comparator.comparing(StatusCell::projectCode)
                .thenComparing(c -> ITEM_ORDER.indexOf(c.item()))
                .thenComparing(StatusCell::month));
        return out;
    }

    private static void putActual(Map<String, BigDecimal[]> cells, Long projectId, String item, YearMonth ym, BigDecimal v) {
        if (v == null || v.signum() == 0) return;
        cells.merge(projectId + "|" + item + "|" + ym, new BigDecimal[]{BigDecimal.ZERO, v},
                (x, y) -> new BigDecimal[]{x[0].add(y[0]), x[1].add(y[1])});
    }

    /** 달성률(%) = 실적/계획*100. 계획이 0 이하이면 0으로 둔다(나눗셈·음수 왜곡 방지). */
    private BigDecimal rate(BigDecimal actual, BigDecimal plan) {
        if (plan == null || plan.signum() <= 0) return BigDecimal.ZERO;
        return actual.multiply(BigDecimal.valueOf(100)).divide(plan, 1, RoundingMode.HALF_UP);
    }
}
