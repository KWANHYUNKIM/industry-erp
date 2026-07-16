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
import com.erp.production.dto.ProductionPlanDtos.PlanResponse;
import com.erp.inventory.repository.ItemRepository;
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
import java.util.Map;
import com.erp.production.dto.ProductionDtos;
import com.erp.production.dto.ProductionPlanDtos;

@Service
@RequiredArgsConstructor
public class ProductionPlanService {

    private final ProductionPlanRepository planRepository;
    private final ItemRepository itemRepository;
    private final StockRepository stockRepository;
    private final WarehouseRepository warehouseRepository;
    private final WorkOrderService workOrderService;
    private final WorkOrderRepository workOrderRepository;

    @Transactional(readOnly = true)
    public List<PlanResponse> findAll() {
        Map<Long, BigDecimal> stockByItem = currentStockByItem();
        return planRepository.findAllWithProduct().stream()
                .map(p -> PlanResponse.from(p, stockByItem.getOrDefault(p.getProduct().getId(), BigDecimal.ZERO)))
                .toList();
    }

    @Transactional
    public PlanResponse create(CreatePlanRequest req, String username) {
        Item product = itemRepository.findById(req.productId())
                .orElseThrow(() -> ApiException.notFound("제품을 찾을 수 없습니다. id=" + req.productId()));
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
        Warehouse warehouse = warehouseRepository.findAll().stream().findFirst()
                .orElseThrow(() -> ApiException.badRequest("등록된 창고가 없습니다."));

        WorkOrderResponse wo = workOrderService.create(new CreateWorkOrderRequest(
                plan.getProduct().getId(), warehouse.getId(), plan.getPlanQty(),
                LocalDate.now(), null, "생산계획 " + plan.getPlanWeek() + " 자동생성"), username);

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
