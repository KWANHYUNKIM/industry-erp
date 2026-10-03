package com.erp.trade.salesplan;

import com.erp.trade.partner.PartnerService;
import com.erp.common.ApiException;
import com.erp.inventory.project.ProjectService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.inventory.item.Item;
import com.erp.inventory.item.ItemService;
import com.erp.trade.sales.Sales;
import com.erp.trade.sales.SalesLine;
import com.erp.trade.salesplan.dto.SalesPlanDtos.ComparisonRow;
import com.erp.trade.salesplan.dto.SalesPlanDtos.CreateSalesPlanRequest;
import com.erp.trade.salesplan.dto.SalesPlanDtos.SalesPlanResponse;
import com.erp.trade.sales.SalesRepository;
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
 * 매출계획: 품목별 월 목표(수량·금액)의 CRUD와, 판매 실적 대조(비교표).
 * 실적은 저장하지 않고 판매(Sales) 집계로 계산한다.
 */
@Service
@RequiredArgsConstructor
public class SalesPlanService {

    private final SalesPlanRepository planRepository;
    /* 다른 모듈의 값은 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final WarehouseService warehouseService;
    private final ProjectService projectService;
    private final PartnerService partnerService;
    private final SalesRepository salesRepository;   // 같은 모듈(trade)
    private final ItemService itemService;           // inventory 의 공개 API
    private final com.erp.hr.employee.EmployeeService employeeService;
    private final com.erp.common.DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<SalesPlanResponse> findAll(Integer year) {
        List<SalesPlan> plans = (year != null)
                ? planRepository.findByPlanYearWithItem(year)
                : planRepository.findAllWithItem();
        return plans.stream().map(SalesPlanResponse::from).toList();
    }

    @Transactional
    public SalesPlanResponse create(CreateSalesPlanRequest req, String username) {
        Item item = itemService.get(req.itemId());
        /*
         * 예상매출일자를 정했으면 <b>계획연월과 같은 달</b>이어야 한다. 5월 계획에 6월
         * 예상일이 붙으면 어느 쪽이 참인지 알 수 없는 줄이 남고, 그 줄은 5월 실적과
         * 견줘진다 — 화면은 멀쩡하고 숫자만 조용히 틀린다.
         */
        if (req.expectedDate() != null
                && (req.expectedDate().getYear() != req.planYear()
                    || req.expectedDate().getMonthValue() != req.planMonth())) {
            throw ApiException.badRequest(
                    "예상매출일자가 계획연월과 다릅니다: " + req.expectedDate()
                    + " ≠ " + req.planYear() + "-" + String.format("%02d", req.planMonth()));
        }
        /*
         * 원본 매출계획 격자의 첫 열은 <b>[일자-No.]</b> 다(사본 실측) — 계획 한 줄에도
         * 전표번호가 붙는다. 예상매출일자는 비어 있을 수 있으므로, 없으면 계획연월 1일을
         * 전표일자로 삼는다(둘은 어긋날 수 없다 — 바로 위에서 막았다).
         */
        java.time.LocalDate planDate = req.expectedDate() != null
                ? req.expectedDate()
                : java.time.LocalDate.of(req.planYear(), req.planMonth(), 1);
        SalesPlan plan = SalesPlan.builder()
                .item(item)
                .planDate(planDate)
                .planNo(docNoGenerator.next("SP-", "sales_plans", "plan_no", "plan_date", planDate))
                .warehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()))
                .partner(req.partnerId() == null ? null : partnerService.get(req.partnerId()))
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .employee(req.employeeId() == null ? null : employeeService.get(req.employeeId()))
                .expectedDate(req.expectedDate())
                .planYear(req.planYear())
                .planMonth(req.planMonth())
                .planQty(req.planQty())
                .unitPrice(req.unitPrice() != null ? req.unitPrice() : java.math.BigDecimal.ZERO)
                .planAmount(req.planAmount())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return SalesPlanResponse.from(planRepository.save(plan));
    }

    /**
     * 원본 매출계획입력(E040624) — 여러 줄 전표를 한 번에 저장한다(2026-10-04 실측). 같은 전표번호로 줄마다 한 행.
     * 예상매출액을 안 적으면 수량 × 단가. 빈 전표는 원본처럼 '자료를 입력 바랍니다.'.
     */
    @Transactional
    public List<SalesPlanResponse> createDoc(com.erp.trade.salesplan.dto.SalesPlanDtos.PlanDocRequest req, String username) {
        LocalDate d = req.expectedDate();
        String no = docNoGenerator.next("SP-", "sales_plans", "plan_no", "plan_date", d);
        return writeDoc(no, req, username);
    }

    /** 전표 수정 — 줄을 통째로 바꾼다. 번호 · 일자는 그대로. */
    @Transactional
    public List<SalesPlanResponse> updateDoc(String planNo, com.erp.trade.salesplan.dto.SalesPlanDtos.PlanDocRequest req, String username) {
        List<SalesPlan> old = planRepository.findByPlanNoOrderByLineNo(planNo);
        if (old.isEmpty()) throw ApiException.notFound("매출계획을 찾을 수 없습니다: " + planNo);
        LocalDate d = old.get(0).getPlanDate();
        planRepository.deleteAll(old);
        planRepository.flush();
        return writeDoc(planNo, new com.erp.trade.salesplan.dto.SalesPlanDtos.PlanDocRequest(d, req.warehouseId(), req.projectId(), req.lines()), username);
    }

    /** 원본 [삭제] · [선택삭제] 는 전표째 지운다. */
    @Transactional
    public void deleteDoc(String planNo) {
        List<SalesPlan> rows = planRepository.findByPlanNoOrderByLineNo(planNo);
        if (rows.isEmpty()) throw ApiException.notFound("매출계획을 찾을 수 없습니다: " + planNo);
        planRepository.deleteAll(rows);
    }

    private List<SalesPlanResponse> writeDoc(String no, com.erp.trade.salesplan.dto.SalesPlanDtos.PlanDocRequest req, String username) {
        var lines = req.lines() == null ? List.<com.erp.trade.salesplan.dto.SalesPlanDtos.PlanLineRequest>of() : req.lines();
        if (lines.isEmpty()) throw ApiException.badRequest("자료를 입력 바랍니다.");
        LocalDate d = req.expectedDate();
        var warehouse = req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId());
        var project = req.projectId() == null ? null : projectService.get(req.projectId());
        List<SalesPlanResponse> out = new ArrayList<>();
        int lineNo = 1;
        for (var l : lines) {
            BigDecimal qty = nz(l.planQty());
            BigDecimal price = nz(l.unitPrice());
            BigDecimal amount = l.planAmount() != null ? l.planAmount() : qty.multiply(price);
            SalesPlan p = SalesPlan.builder()
                    .item(itemService.get(l.itemId()))
                    .planDate(d).planNo(no).lineNo(lineNo++)
                    .warehouse(warehouse).project(project)
                    .partner(l.partnerId() == null ? null : partnerService.get(l.partnerId()))
                    .employee(l.employeeId() == null ? null : employeeService.get(l.employeeId()))
                    .expectedDate(d).planYear(d.getYear()).planMonth(d.getMonthValue())
                    .planQty(qty).unitPrice(price).planAmount(amount)
                    .remark(l.remark()).createdBy(username)
                    .build();
            out.add(SalesPlanResponse.from(planRepository.save(p)));
        }
        return out;
    }

    @Transactional
    public void delete(Long id) {
        if (!planRepository.existsById(id)) {
            throw ApiException.notFound("매출계획을 찾을 수 없습니다. id=" + id);
        }
        planRepository.deleteById(id);
    }

    /**
     * 매출계획비교표: 해당 연도의 계획 각 줄에 대해 실적(판매 집계)과 달성률을 채운다.
     * 실적 = 그 (품목, 월)의 판매 라인 supplyAmount/quantity 합.
     */
    @Transactional(readOnly = true)
    public List<ComparisonRow> comparison(int year, String saleFlag) {
        /*
         * 원본 [반품구분] — 전체 · 일반 · 반품. 체크박스라 셋 다 켜져 있는 것이 기본이다.
         *
         * <p><b>실적에 반품을 넣느냐 빼느냐로 달성률이 통째로 달라진다.</b> 반품 전표는 금액이
         * 음수라, 넣으면 판 것에서 되돌아온 것을 뺀 <b>순매출</b>이 되고 빼면 <b>총매출</b>이 된다.
         * 어느 쪽인지 고를 수 없으면, 그 달에 반품이 많았을 때 화면이 말하는 달성률이
         * 무엇을 뜻하는지 알 수가 없다.
         */
        boolean withNormal = saleFlag == null || saleFlag.isBlank()
                || "전체".equals(saleFlag) || "일반".equals(saleFlag);
        boolean withReturn = saleFlag == null || saleFlag.isBlank()
                || "전체".equals(saleFlag) || "반품".equals(saleFlag);
        if (!withNormal && !withReturn) {
            throw ApiException.badRequest("반품구분은 전체 · 일반 · 반품 중 하나여야 합니다: " + saleFlag);
        }
        List<SalesPlan> plans = planRepository.findByPlanYearWithItem(year);

        /*
         * 계획이 고른 축으로만 실적을 센다.
         *
         * <p>계획에 [창고]·[거래처]·[프로젝트]가 생기면서 <b>실적을 맞추는 규칙도 같이 바뀐다.</b>
         * 창고를 고른 계획은 <b>그 창고에서 나간 판매만</b> 실적이다. 안 그러면 창고별로
         * 계획을 쪼갠 순간 같은 판매가 <b>모든 줄에 중복으로</b> 잡혀 달성률이 다 같이
         * 부풀어 오른다. 축을 안 고른(널) 계획은 그 축 전부를 합친다 — 예전 동작 그대로다.
         */
        List<Sales> sales = salesRepository.findWithLinesBySaleDateBetween(
                LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));

        List<ComparisonRow> out = new ArrayList<>();
        for (SalesPlan p : plans) {
            BigDecimal actualQty = BigDecimal.ZERO;
            BigDecimal actualAmount = BigDecimal.ZERO;
            for (Sales s : sales) {
                if (s.getSaleDate().getMonthValue() != p.getPlanMonth()) continue;
                if (s.isReturnSlip() ? !withReturn : !withNormal) continue;
                if (!matches(p.getWarehouse(), s.getWarehouse())) continue;
                if (!matches(p.getPartner(), s.getPartner())) continue;
                if (!matches(p.getProject(), s.getProject())) continue;
                if (!matches(p.getEmployee(), s.getEmployee())) continue;
                for (SalesLine l : s.getLines()) {
                    if (!l.getItem().getId().equals(p.getItem().getId())) continue;
                    actualQty = actualQty.add(nz(l.getQuantity()));
                    actualAmount = actualAmount.add(nz(l.getSupplyAmount()));
                }
            }
            BigDecimal rate = p.getPlanAmount().signum() == 0
                    ? BigDecimal.ZERO
                    : actualAmount.multiply(BigDecimal.valueOf(100))
                        .divide(p.getPlanAmount(), 1, RoundingMode.HALF_UP);
            out.add(new ComparisonRow(
                    p.getId(),
                    p.getPlanNo(), p.getPlanDate(), p.getUpdatedAt(),
                    p.getPlanYear(), p.getPlanMonth(),
                    p.getItem().getId(), p.getItem().getName(), p.getItem().getUnit(),
                    p.getItem().getCategory(),
                    p.getItem().getCategory() != null ? p.getItem().getCategory().getDisplayName() : null,
                    p.getWarehouse() != null ? p.getWarehouse().getId() : null,
                    p.getWarehouse() != null ? p.getWarehouse().getName() : null,
                    p.getPartner() != null ? p.getPartner().getId() : null,
                    p.getPartner() != null ? p.getPartner().getName() : null,
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getEmployee() != null ? p.getEmployee().getId() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getItem().getCode(),
                    p.getWarehouse() != null ? p.getWarehouse().getCode() : null,
                    p.getPartner() != null ? p.getPartner().getCode() : null,
                    p.getProject() != null ? p.getProject().getCode() : null,
                    p.getEmployee() != null ? p.getEmployee().getCode() : null,
                    p.getExpectedDate(),
                    p.getPlanQty(), p.getUnitPrice(), p.getPlanAmount(), actualQty, actualAmount, rate,
                    p.getRemark(), p.getCreatedBy(), p.getCreatedAt()));
        }
        return out;
    }

    /**
     * 원본 매출계획비교표(E040626) — 기간 안 계획(예상매출일자)과 기간 안 판매(공급가액 · 수량)를
     * [표시조건1 · 2] 축으로 묶어 견준다. 판매는 계획이 있든 없든 다 센다(원본 9월 실측: 계획 97,000 · 매출 590,280,000).
     * 조건(품목 · 거래처 · 창고 · 담당자 · 프로젝트)은 양쪽에 같이 건다 — 품목은 줄, 나머지는 전표 머리의 값이다.
     *
     * @param by1 by2 ITEM · PARTNER · WAREHOUSE · EMPLOYEE · PROJECT 또는 없음
     */
    @Transactional(readOnly = true)
    public List<com.erp.trade.salesplan.dto.SalesPlanDtos.CompareRow> compare(
            LocalDate from, LocalDate to, String saleFlag, String by1, String by2,
            Long itemId, Long partnerId, Long warehouseId, Long employeeId, Long projectId) {
        boolean withNormal = saleFlag == null || saleFlag.isBlank() || "전체".equals(saleFlag) || "일반".equals(saleFlag);
        boolean withReturn = saleFlag == null || saleFlag.isBlank() || "전체".equals(saleFlag) || "반품".equals(saleFlag);
        if (!withNormal && !withReturn) {
            throw ApiException.badRequest("반품구분은 전체 · 일반 · 반품 중 하나여야 합니다: " + saleFlag);
        }
        java.util.Map<String, BigDecimal[]> acc = new java.util.LinkedHashMap<>();
        java.util.Map<String, String[]> labels = new java.util.HashMap<>();
        for (SalesPlan p : planRepository.findByPlanDateBetween(from, to)) {
            if (!pass(itemId, p.getItem()) || !pass(partnerId, p.getPartner()) || !pass(warehouseId, p.getWarehouse())
                    || !pass(employeeId, p.getEmployee()) || !pass(projectId, p.getProject())) continue;
            Object[] dims = {p.getItem(), p.getPartner(), p.getWarehouse(), p.getEmployee(), p.getProject()};
            add(acc, labels, dims, by1, by2, nz(p.getPlanAmount()), nz(p.getPlanQty()), BigDecimal.ZERO, BigDecimal.ZERO);
        }
        for (Sales s : salesRepository.findWithLinesBySaleDateBetween(from, to)) {
            if (s.isReturnSlip() ? !withReturn : !withNormal) continue;
            if (!pass(partnerId, s.getPartner()) || !pass(warehouseId, s.getWarehouse())
                    || !pass(employeeId, s.getEmployee()) || !pass(projectId, s.getProject())) continue;
            for (SalesLine l : s.getLines()) {
                if (!pass(itemId, l.getItem())) continue;
                Object[] dims = {l.getItem(), s.getPartner(), s.getWarehouse(), s.getEmployee(), s.getProject()};
                add(acc, labels, dims, by1, by2, BigDecimal.ZERO, BigDecimal.ZERO, nz(l.getSupplyAmount()), nz(l.getQuantity()));
            }
        }
        List<com.erp.trade.salesplan.dto.SalesPlanDtos.CompareRow> out = new ArrayList<>();
        acc.forEach((k, v) -> {
            String[] lb = labels.get(k);
            out.add(new com.erp.trade.salesplan.dto.SalesPlanDtos.CompareRow(lb[0], lb[1], lb[2], lb[3], v[0], v[1], v[2], v[3]));
        });
        out.sort(java.util.Comparator.comparing((com.erp.trade.salesplan.dto.SalesPlanDtos.CompareRow r) -> r.key1Code() == null ? "" : r.key1Code())
                .thenComparing(r -> r.key2Code() == null ? "" : r.key2Code()));
        return out;
    }

    private boolean pass(Long id, Object master) {
        return id == null || (master != null && idOf(master).equals(id));
    }

    private void add(java.util.Map<String, BigDecimal[]> acc, java.util.Map<String, String[]> labels, Object[] dims,
                     String by1, String by2, BigDecimal planAmt, BigDecimal planQty, BigDecimal saleAmt, BigDecimal saleQty) {
        String[] k1 = keyOf(dims, by1), k2 = keyOf(dims, by2);
        String key = k1[0] + "\u0001" + k2[0];
        labels.putIfAbsent(key, new String[]{k1[0], k1[1], k2[0], k2[1]});
        BigDecimal[] v = acc.computeIfAbsent(key, x -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
        v[0] = v[0].add(planAmt); v[1] = v[1].add(planQty); v[2] = v[2].add(saleAmt); v[3] = v[3].add(saleQty);
    }

    /** 축 하나의 [코드, 이름]. 고르지 않은 축(없음)은 빈 칸 하나로 모은다. 값이 없는 전표는 코드 없이 '(미지정)'. */
    private String[] keyOf(Object[] dims, String by) {
        int i = by == null ? -1 : switch (by) {
            case "ITEM" -> 0; case "PARTNER" -> 1; case "WAREHOUSE" -> 2; case "EMPLOYEE" -> 3; case "PROJECT" -> 4;
            default -> -1;
        };
        if (i < 0) return new String[]{null, null};
        Object o = dims[i];
        if (o == null) return new String[]{"", "(미지정)"};
        if (o instanceof Item it) return new String[]{it.getCode(), it.getName()};
        if (o instanceof com.erp.inventory.warehouse.Warehouse w) return new String[]{w.getCode(), w.getName()};
        if (o instanceof com.erp.inventory.project.Project pr) return new String[]{pr.getCode(), pr.getName()};
        if (o instanceof com.erp.trade.partner.BusinessPartner bp) return new String[]{bp.getCode(), bp.getName()};
        if (o instanceof com.erp.hr.employee.Employee e) return new String[]{e.getCode(), e.getName()};
        return new String[]{"", String.valueOf(o)};
    }

    /**
     * 계획이 고른 축과 전표의 축이 맞나. <b>계획이 안 고른 축(널)은 무엇과도 맞는다</b> —
     * "그 축은 안 나눈다" 는 뜻이기 때문이다.
     */
    private boolean matches(Object planSide, Object docSide) {
        if (planSide == null) return true;
        if (docSide == null) return false;
        return idOf(planSide).equals(idOf(docSide));
    }

    private Long idOf(Object o) {
        if (o instanceof com.erp.inventory.warehouse.Warehouse w) return w.getId();
        if (o instanceof com.erp.inventory.project.Project pr) return pr.getId();
        if (o instanceof com.erp.trade.partner.BusinessPartner bp) return bp.getId();
        if (o instanceof com.erp.hr.employee.Employee e) return e.getId();
        if (o instanceof Item it) return it.getId();
        throw new IllegalStateException("맞출 수 없는 축: " + o.getClass());
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
