package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.production.domain.ProductionPlan;
import com.erp.production.domain.ProductionPlanStatus;
import com.erp.inventory.domain.Stock;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.production.dto.ProductionDtos.WorkOrderResponse;
import com.erp.production.dto.ProductionPlanDtos.CreatePlanRequest;
import com.erp.production.dto.ProductionPlanDtos.GeneratePlanRequest;
import com.erp.production.dto.ProductionPlanDtos.GenerateResult;
import com.erp.trade.dto.SalesOrderDtos.UnsoldLineResponse;
import com.erp.trade.service.SalesOrderService;
import com.erp.production.dto.ProductionPlanDtos.PlanResponse;
import com.erp.inventory.service.ItemService;
import com.erp.production.repository.ProductionPlanRepository;
import com.erp.inventory.repository.StockRepository;
import com.erp.inventory.repository.WarehouseRepository;
import com.erp.production.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import com.erp.production.dto.ProductionDtos;
import com.erp.production.dto.ProductionPlanDtos;

@Service
@RequiredArgsConstructor
public class ProductionPlanService {

    private final ProductionPlanRepository planRepository;
    // inventory 의 공개 service 를 거친다(CLAUDE.md 4.2).
    private final ItemService itemService;
    private final StockRepository stockRepository;
    private final WarehouseRepository warehouseRepository;
    private final WorkOrderService workOrderService;
    private final WorkOrderRepository workOrderRepository;
    /*
     * trade 의 공개 service 를 거친다(CLAUDE.md 4.2). production → trade 는 이미 있는
     * 방향이라 순환이 아니다 — 작업지시서의 납품처가 PartnerService 를 쓰고 있다.
     */
    private final SalesOrderService salesOrderService;

    @Transactional(readOnly = true)
    public List<PlanResponse> findAll() {
        Map<Long, BigDecimal> stockByItem = currentStockByItem();
        return planRepository.findAllWithProduct().stream()
                .map(p -> PlanResponse.from(p, stockByItem.getOrDefault(p.getProduct().getId(), BigDecimal.ZERO)))
                .toList();
    }

    @Transactional
    public PlanResponse create(CreatePlanRequest req, String username) {
        // 사용중지한 제품으로 앞으로의 계획을 세울 수는 없다 — 원본은 코드도움에 띄우지도 않는다.
        Item product = itemService.getUsable(req.productId());
        ProductionPlan plan = ProductionPlan.builder()
                .product(product)
                .planWeek(req.planWeek())
                .demandQty(req.demandQty())
                .planQty(req.planQty())
                .status(ProductionPlanStatus.REVIEW)
                .remark(req.remark())
                .createdBy(username)
                .build();
        planRepository.save(plan);
        return PlanResponse.from(plan, currentStockByItem().getOrDefault(product.getId(), BigDecimal.ZERO));
    }

    /**
     * 원본 <b>생산계획/MRP생성</b> — [생산계획대상-전표] <b>미판매</b> 기준.
     *
     * <p>주문은 받았는데 아직 매출로 못 끊은 잔량을 품목별로 모아, <b>현재고를 뺀 부족분</b>
     * 만큼 계획을 만든다. 창고에 있는 것을 또 만들 이유가 없다.
     *
     * <p>이미 그 주차에 그 품목의 계획이 있으면 <b>건너뛴다.</b> 덮어쓰면 사람이 손으로
     * 고쳐 둔 수량이 사라지고, 하나 더 만들면 같은 주차에 두 계획이 생겨 둘 다 지시로 넘어간다.
     *
     * <p>몇 건을 왜 만들었는지 같이 돌려준다 — 0건일 때 이유를 모르면 고장으로 읽힌다.
     */
    @Transactional
    public GenerateResult generateFromUnsold(GeneratePlanRequest req, String username) {
        String week = req.planWeek().trim();
        boolean deduct = req.deductStock() == null || req.deductStock();

        Map<Long, BigDecimal> demand = new LinkedHashMap<>();
        for (UnsoldLineResponse r : salesOrderService.findUnsold()) {
            demand.merge(r.itemId(), r.unsoldQty(), BigDecimal::add);
        }

        Map<Long, BigDecimal> stock = currentStockByItem();
        Set<Long> already = planRepository.findAllWithProduct().stream()
                .filter(p -> week.equals(p.getPlanWeek()))
                .map(p -> p.getProduct().getId())
                .collect(Collectors.toSet());

        int skippedExisting = 0;
        int skippedCovered = 0;
        List<PlanResponse> made = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> e : demand.entrySet()) {
            if (already.contains(e.getKey())) { skippedExisting++; continue; }
            BigDecimal need = deduct
                    ? e.getValue().subtract(stock.getOrDefault(e.getKey(), BigDecimal.ZERO))
                    : e.getValue();
            if (need.signum() <= 0) { skippedCovered++; continue; }

            // 사용중지한 품목은 앞으로의 계획을 세울 수 없다. 주문에 남아 있어도 건너뛴다.
            Item product;
            try {
                product = itemService.getUsable(e.getKey());
            } catch (ApiException ignored) {
                skippedCovered++;
                continue;
            }
            ProductionPlan plan = ProductionPlan.builder()
                    .product(product)
                    .planWeek(week)
                    .demandQty(e.getValue())
                    .planQty(need)
                    .status(ProductionPlanStatus.REVIEW)
                    .remark("미판매 기준 자동생성")
                    .createdBy(username)
                    .build();
            planRepository.save(plan);
            made.add(PlanResponse.from(plan, stock.getOrDefault(e.getKey(), BigDecimal.ZERO)));
        }
        return new GenerateResult(made.size(), skippedExisting, skippedCovered, made);
    }

    /**
     * 생산계획 삭제. 원본(이카운트) 생산계획/MRP리스트의 [삭제] 에 해당한다.
     *
     * <p>작업지시로 이미 전환된 계획은 막는다. 계획만 사라지고 작업지시가 남으면
     * "이 작업지시는 어느 계획에서 나왔나"에 답할 수 없게 된다. 작업지시를 먼저 지우면
     * 이 계획도 지울 수 있다.
     */
    @Transactional
    public void delete(Long id) {
        ProductionPlan plan = planRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산계획을 찾을 수 없습니다. id=" + id));
        if (plan.getWorkOrder() != null) {
            throw ApiException.badRequest(
                    "작업지시로 전환된 계획은 삭제할 수 없습니다. 작업지시를 먼저 지우세요: "
                            + plan.getWorkOrder().getOrderNo());
        }
        planRepository.delete(plan);
    }

    @Transactional
    public PlanResponse updateStatus(Long id, ProductionPlanStatus status) {
        ProductionPlan plan = getPlan(id);
        plan.setStatus(status);
        return PlanResponse.from(plan, currentStockByItem().getOrDefault(plan.getProduct().getId(), BigDecimal.ZERO));
    }

    /** 계획 → 작업지시 생성 */
    @Transactional
    public PlanResponse generateWorkOrder(Long id, String username) {
        ProductionPlan plan = getPlan(id);
        if (plan.getWorkOrder() != null) {
            throw ApiException.badRequest("이미 작업지시가 생성된 계획입니다: " + plan.getWorkOrder().getOrderNo());
        }
        if (plan.getPlanQty().signum() <= 0) {
            throw ApiException.badRequest("계획수량이 0이면 작업지시를 생성할 수 없습니다.");
        }
        /*
         * <b>확정한 계획만</b> 지시로 넘긴다.
         *
         * <p>예전에는 상태를 안 봤다 — 검토 중인 계획도 그대로 작업지시가 됐다.
         * 아직 정하지도 않은 수량이 현장으로 나가는 것이라, 화면에서 버튼을 감추는 것만으로는
         * 부족하다(API 를 직접 부르면 그대로 통과한다).
         */
        if (plan.getStatus() != ProductionPlanStatus.CONFIRMED) {
            throw ApiException.badRequest(
                    "확정한 계획만 작업지시로 넘길 수 있습니다. 현재 상태: " + plan.getStatus().getDisplayName());
        }
        Warehouse warehouse = warehouseRepository.findAll().stream().findFirst()
                .orElseThrow(() -> ApiException.badRequest("등록된 창고가 없습니다."));

        // 생산계획에서 자동으로 만드는 지시라 납품처·담당자·납기는 정할 수 없다.
        // 지어내지 않고 비워 둔다 — 사람이 작업지시서에서 채운다.
        WorkOrderResponse wo = workOrderService.create(CreateWorkOrderRequest.of(
                plan.getProduct().getId(), warehouse.getId(), plan.getPlanQty(), LocalDate.now(),
                "생산계획 " + plan.getPlanWeek() + " 자동생성"), username);

        plan.setWorkOrder(workOrderRepository.findById(wo.id())
                .orElseThrow(() -> ApiException.notFound("생성된 작업지시를 찾을 수 없습니다. id=" + wo.id())));
        plan.setStatus(ProductionPlanStatus.ORDERED);
        return PlanResponse.from(plan, currentStockByItem().getOrDefault(plan.getProduct().getId(), BigDecimal.ZERO));
    }

    private ProductionPlan getPlan(Long id) {
        return planRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산계획을 찾을 수 없습니다. id=" + id));
    }

    /** 품목별 현재고 합계(전 창고) */
    private Map<Long, BigDecimal> currentStockByItem() {
        Map<Long, BigDecimal> map = new HashMap<>();
        for (Stock s : stockRepository.findAllWithItemAndWarehouse()) {
            map.merge(s.getItem().getId(), s.getQuantity(), BigDecimal::add);
        }
        return map;
    }
}
