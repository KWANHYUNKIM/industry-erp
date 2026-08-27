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
import com.erp.inventory.repository.WarehouseRepository;
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
    private final WarehouseRepository warehouseRepository;
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

        /*
         * 원본은 [생산된공장] → [받는창고] 로 옮기는 전표다(생산입고조회의 두 열).
         * 자재는 공장에서 빠지고 완제품은 받는창고로 들어간다 — 생산불출(창고 → 공장)의 반대다.
         *
         * <p>둘 다 안 주면 예전처럼 작업지시의 창고 하나에서 오간다. 공장을 안 쓰는 회사도 있다.
         */
        Warehouse warehouse = req.warehouseId() != null
                ? warehouseRepository.findById(req.warehouseId())
                        .orElseThrow(() -> ApiException.notFound("받는창고를 찾을 수 없습니다. id=" + req.warehouseId()))
                : wo.getWarehouse();
        Warehouse from = req.fromWarehouseId() != null
                ? warehouseRepository.findById(req.fromWarehouseId())
                        .orElseThrow(() -> ApiException.notFound("생산된공장을 찾을 수 없습니다. id=" + req.fromWarehouseId()))
                : warehouse;

        Production production = Production.builder()
                .prodNo(generateProdNo(date))
                .workOrder(wo)
                .product(wo.getProduct())
                .warehouse(warehouse)
                .fromWarehouse(req.fromWarehouseId() != null ? from : null)
                .note(req.note())
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
                stockService.applyDelta(component, from, line.quantity().negate(),
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
                stockService.applyDelta(component, from, consume.negate(),
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

    /**
     * 생산실적 삭제. 원본(이카운트) 생산입고조회의 [선택삭제] 에 해당한다.
     *
     * <p>삭제가 아예 없었다. 수량을 잘못 넣은 생산실적은 되돌릴 방법이 없어서
     * 완제품 재고와 자재 재고가 그대로 틀린 채 남았고, 작업지시는 영영 '완료' 였다.
     * 판매·구매·견적·수주에서 같은 것을 이미 한 번 고쳤다.
     *
     * <p>재고는 <b>지우지 않고 반대 거래를 남긴다</b> — 완제품을 출고하고 자재를 되돌린다.
     * 이력을 지우면 왜 재고가 움직였는지 아무도 설명할 수 없게 된다.
     */
    @Transactional
    public void delete(Long id, String username) {
        Production p = productionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산실적을 찾을 수 없습니다. id=" + id));

        LocalDate date = p.getProductionDate();
        Warehouse warehouse = p.getWarehouse();

        // 1) 완제품을 도로 뺀다. 이미 팔려 나가 재고가 모자라면 여기서 막힌다 —
        //    그 편이 맞다. 없는 물건을 지워서 재고를 음수로 만들면 안 된다.
        stockService.applyDelta(p.getProduct(), warehouse, p.getProducedQty().negate(),
                StockTransactionType.OUTBOUND, null, date,
                "생산입고취소 " + p.getProdNo(), username);

        // 2) 소모했던 자재를 되돌린다 — 뺐던 곳(생산된공장)으로 돌려놓는다.
        //    받는창고로 돌려놓으면 공장 재고가 영영 모자란 채로 남는다.
        Warehouse consumedAt = p.getFromWarehouse() != null ? p.getFromWarehouse() : warehouse;
        for (ProductionMaterial m : p.getMaterials()) {
            stockService.applyDelta(m.getComponent(), consumedAt, m.getQuantity(),
                    StockTransactionType.INBOUND, null, date,
                    "생산소요취소 " + p.getProdNo(), username);
        }

        // 3) 작업지시 진척을 되돌린다. 완료였던 것이 다시 진행중/계획으로 돌아간다.
        WorkOrder wo = p.getWorkOrder();
        if (wo != null) {
            BigDecimal left = wo.getProducedQty().subtract(p.getProducedQty());
            wo.setProducedQty(left.signum() < 0 ? BigDecimal.ZERO : left);
            wo.setStatus(wo.getProducedQty().signum() == 0
                    ? WorkOrderStatus.PLANNED
                    : (wo.getProducedQty().compareTo(wo.getPlannedQty()) >= 0
                            ? WorkOrderStatus.COMPLETED : WorkOrderStatus.IN_PROGRESS));
        }

        productionRepository.delete(p);
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
