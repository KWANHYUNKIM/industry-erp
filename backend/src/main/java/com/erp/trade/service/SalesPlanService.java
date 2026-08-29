package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.service.WarehouseService;
import com.erp.inventory.domain.Item;
import com.erp.inventory.service.ItemService;
import com.erp.trade.domain.Sales;
import com.erp.trade.domain.SalesLine;
import com.erp.trade.domain.SalesPlan;
import com.erp.trade.dto.SalesPlanDtos.ComparisonRow;
import com.erp.trade.dto.SalesPlanDtos.CreateSalesPlanRequest;
import com.erp.trade.dto.SalesPlanDtos.SalesPlanResponse;
import com.erp.trade.repository.SalesPlanRepository;
import com.erp.trade.repository.SalesRepository;
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
    private final com.erp.hr.service.EmployeeService employeeService;

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
        SalesPlan plan = SalesPlan.builder()
                .item(item)
                .warehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()))
                .partner(req.partnerId() == null ? null : partnerService.get(req.partnerId()))
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .employee(req.employeeId() == null ? null : employeeService.get(req.employeeId()))
                .planYear(req.planYear())
                .planMonth(req.planMonth())
                .planQty(req.planQty())
                .planAmount(req.planAmount())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return SalesPlanResponse.from(planRepository.save(plan));
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
                    p.getId(), p.getPlanYear(), p.getPlanMonth(),
                    p.getItem().getId(), p.getItem().getName(), p.getItem().getUnit(),
                    p.getWarehouse() != null ? p.getWarehouse().getId() : null,
                    p.getWarehouse() != null ? p.getWarehouse().getName() : null,
                    p.getPartner() != null ? p.getPartner().getId() : null,
                    p.getPartner() != null ? p.getPartner().getName() : null,
                    p.getProject() != null ? p.getProject().getId() : null,
                    p.getProject() != null ? p.getProject().getName() : null,
                    p.getEmployee() != null ? p.getEmployee().getId() : null,
                    p.getEmployee() != null ? p.getEmployee().getName() : null,
                    p.getPlanQty(), p.getPlanAmount(), actualQty, actualAmount, rate));
        }
        return out;
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
        if (o instanceof com.erp.inventory.domain.Warehouse w) return w.getId();
        if (o instanceof com.erp.inventory.domain.Project pr) return pr.getId();
        if (o instanceof com.erp.trade.domain.BusinessPartner bp) return bp.getId();
        if (o instanceof com.erp.hr.domain.Employee e) return e.getId();
        throw new IllegalStateException("맞출 수 없는 축: " + o.getClass());
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
