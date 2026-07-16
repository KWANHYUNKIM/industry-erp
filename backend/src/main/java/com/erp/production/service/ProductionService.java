package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.production.domain.Bom;
import com.erp.production.domain.BomLine;
import com.erp.inventory.domain.Item;
import com.erp.production.domain.Production;
import com.erp.production.domain.ProductionMaterial;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.domain.WorkOrder;
import com.erp.production.domain.WorkOrderStatus;
import com.erp.production.dto.ProductionDtos.CreateProductionRequest;
import com.erp.production.dto.ProductionDtos.ManualConsumeLine;
import com.erp.production.dto.ProductionDtos.ProductionMaterialResponse;
import com.erp.production.dto.ProductionDtos.ProductionResponse;
import com.erp.production.repository.BomRepository;
import com.erp.inventory.repository.ItemRepository;
import com.erp.production.repository.ProductionRepository;
import com.erp.production.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.service.StockService;
import com.erp.production.dto.ProductionDtos;

@Service
@RequiredArgsConstructor
public class ProductionService {

    private final ProductionRepository productionRepository;
    private final WorkOrderRepository workOrderRepository;
    private final BomRepository bomRepository;
    private final ItemRepository itemRepository;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<ProductionResponse> findAll() {
        return productionRepository.findAllWithRefs().stream()
                .map(ProductionResponse::from)
                .toList();
    }

    /** 생산수량에 대한 예상 소요자재(미저장) */
    @Transactional(readOnly = true)
    public List<ProductionMaterialResponse> materialPreview(Long workOrderId, BigDecimal producedQty) {
        WorkOrder wo = getWorkOrder(workOrderId);
        Bom bom = getBom(wo.getProduct());
        return bom.getLines().stream()
                .map(l -> new ProductionMaterialResponse(
                        l.getComponent().getId(), l.getComponent().getCode(), l.getComponent().getName(),
                        l.getComponent().getUnit(), l.getQuantity().multiply(producedQty)))
                .toList();
    }

    /** 생산실적 등록: 자재 출고(수동 소모목록 있으면 그대로, 없으면 BOM 자동소모) + 완제품 입고 */
    @Transactional
    public ProductionResponse create(CreateProductionRequest req, String username) {
        WorkOrder wo = getWorkOrder(req.workOrderId());
        boolean manualConsume = req.materials() != null && !req.materials().isEmpty();

        BigDecimal qty = req.producedQty();
        BigDecimal remaining = wo.getPlannedQty().subtract(wo.getProducedQty());
        if (qty.compareTo(remaining) > 0) {
            throw ApiException.badRequest(String.format(
                    "지시수량을 초과합니다. 잔여 %s (지시 %s, 기생산 %s)",
                    remaining.toPlainString(), wo.getPlannedQty().toPlainString(), wo.getProducedQty().toPlainString()));
        }

        LocalDate date = req.productionDate() != null ? req.productionDate() : LocalDate.now();
        Warehouse warehouse = wo.getWarehouse();

        Production production = Production.builder()
                .prodNo(generateProdNo(date))
                .workOrder(wo)
                .product(wo.getProduct())
                .warehouse(warehouse)
                .producedQty(qty)
                .productionDate(date)
                .createdBy(username)
                .build();

        // 1) 자재 소요 출고 (재고 부족 시 전체 롤백)
        if (manualConsume) {
            // 수동 소모: 요청한 자재/수량 그대로 출고
            for (ManualConsumeLine line : req.materials()) {
                Item component = itemRepository.findById(line.componentId())
                        .orElseThrow(() -> ApiException.notFound("소모자재를 찾을 수 없습니다. id=" + line.componentId()));
                if (component.getId().equals(wo.getProduct().getId())) {
                    throw ApiException.badRequest("완제품 자신을 소모자재로 선택할 수 없습니다: " + component.getName());
                }
                stockService.applyDelta(component, warehouse, line.quantity().negate(),
                        StockTransactionType.OUTBOUND, null, date,
                        "생산소요(수동) " + production.getProdNo(), username);
                production.addMaterial(ProductionMaterial.builder()
                        .component(component).quantity(line.quantity()).build());
            }
        } else {
            // BOM 자동소모
            Bom bom = getBom(wo.getProduct());
            for (BomLine line : bom.getLines()) {
                Item component = line.getComponent();
                BigDecimal consume = line.getQuantity().multiply(qty);
                stockService.applyDelta(component, warehouse, consume.negate(),
                        StockTransactionType.OUTBOUND, null, date,
                        "생산소요 " + production.getProdNo(), username);
                production.addMaterial(ProductionMaterial.builder()
                        .component(component).quantity(consume).build());
            }
        }

        // 2) 완제품 입고
        stockService.applyDelta(wo.getProduct(), warehouse, qty,
                StockTransactionType.INBOUND, null, date,
                "생산입고 " + production.getProdNo(), username);

        // 3) 작업지시 진척 갱신
        wo.setProducedQty(wo.getProducedQty().add(qty));
        wo.setStatus(wo.getProducedQty().compareTo(wo.getPlannedQty()) >= 0
                ? WorkOrderStatus.COMPLETED : WorkOrderStatus.IN_PROGRESS);

        return ProductionResponse.from(productionRepository.save(production));
    }

    private WorkOrder getWorkOrder(Long id) {
        return workOrderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("작업지시를 찾을 수 없습니다. id=" + id));
    }

    private Bom getBom(Item product) {
        return bomRepository.findByProductIdWithProduct(product.getId())
                .orElseThrow(() -> ApiException.badRequest(
                        "제품의 BOM(자재명세서)이 등록되어 있지 않습니다: " + product.getName()));
    }

    private String generateProdNo(LocalDate date) {
        return docNoGenerator.next("PR-", "productions", "prod_no", "production_date", date);
    }
}
