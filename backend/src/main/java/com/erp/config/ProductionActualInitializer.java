package com.erp.config;

import com.erp.domain.Bom;
import com.erp.domain.BomLine;
import com.erp.domain.Item;
import com.erp.domain.MaterialIssue;
import com.erp.domain.StockTransactionType;
import com.erp.domain.Warehouse;
import com.erp.domain.WorkOrder;
import com.erp.domain.WorkOrderStatus;
import com.erp.domain.WorkResult;
import com.erp.dto.ProductionDtos.CreateProductionRequest;
import com.erp.repository.BomRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.MaterialIssueRepository;
import com.erp.repository.WarehouseRepository;
import com.erp.repository.WorkOrderRepository;
import com.erp.repository.WorkResultRepository;
import com.erp.service.ProductionService;
import com.erp.service.StockService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * 최초 기동 시 생산 실적(작업지시·생산실적·작업내역·생산불출) 데모 데이터를 생성한다.
 * 작업지시가 하나도 없을 때에만 전체를 함께 시딩하여 데이터 정합성을 유지한다 (idempotent).
 */
@Slf4j
@Component
@Order(4)
@RequiredArgsConstructor
public class ProductionActualInitializer implements CommandLineRunner {

    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final WorkOrderRepository workOrderRepository;
    private final BomRepository bomRepository;
    private final MaterialIssueRepository materialIssueRepository;
    private final WorkResultRepository workResultRepository;
    private final StockService stockService;
    private final ProductionService productionService;

    @Override
    @Transactional
    public void run(String... args) {
        // 작업지시가 이미 있으면(사용자 데이터 존재) 전체 시딩을 건너뛴다.
        if (workOrderRepository.count() > 0) {
            return;
        }
        Warehouse wh = warehouseRepository.findAll().stream()
                .filter(w -> "WH-01".equals(w.getCode()))
                .findFirst().orElse(null);
        if (wh == null) {
            log.warn("기준 창고(WH-01)가 없어 생산 실적 데모 시딩을 건너뜁니다.");
            return;
        }

        Map<String, Item> items = new HashMap<>();
        for (String code : new String[]{"ITM-0001", "ITM-0002", "ITM-0003", "ITM-0004", "ITM-0005", "ITM-0006"}) {
            itemRepository.findByCode(code).ifPresent(i -> items.put(code, i));
        }
        if (items.size() < 6) {
            log.warn("기준 품목이 부족하여 생산 실적 데모 시딩을 건너뜁니다.");
            return;
        }

        seedStock(items, wh);
        seedBoms(items);
        seedWorkOrdersAndProductions(items, wh);
        seedWorkResults();
        seedMaterialIssues(items, wh);
        log.info("생산 실적 데모 데이터 시딩 완료");
    }

    /** 생산 소요에 필요한 자재 재고를 충분히 입고한다. */
    private void seedStock(Map<String, Item> items, Warehouse wh) {
        stockIn(items.get("ITM-0004"), wh, 1000);
        stockIn(items.get("ITM-0005"), wh, 3000);
        stockIn(items.get("ITM-0006"), wh, 500);
    }

    private void stockIn(Item item, Warehouse wh, long qty) {
        stockService.applyDelta(item, wh, BigDecimal.valueOf(qty),
                StockTransactionType.INBOUND, item.getUnitPrice(), LocalDate.of(2026, 6, 30),
                "생산 데모 초기재고", "system");
    }

    /** 제품별 BOM(자재명세서)을 시딩한다. */
    private void seedBoms(Map<String, Item> items) {
        if (bomRepository.count() > 0) {
            return;
        }
        saveBom(items.get("ITM-0001"), "MQTT 모뎀 자재구성",
                new Object[][]{{items.get("ITM-0004"), "1"}, {items.get("ITM-0005"), "2"}, {items.get("ITM-0006"), "0.1"}});
        saveBom(items.get("ITM-0002"), "센서모듈 자재구성",
                new Object[][]{{items.get("ITM-0005"), "1"}, {items.get("ITM-0006"), "0.05"}});
        saveBom(items.get("ITM-0003"), "열교환기 자재구성",
                new Object[][]{{items.get("ITM-0005"), "3"}});
    }

    private void saveBom(Item product, String remark, Object[][] lines) {
        Bom bom = Bom.builder().product(product).remark(remark).active(true).build();
        for (Object[] l : lines) {
            bom.addLine(BomLine.builder()
                    .component((Item) l[0])
                    .quantity(new BigDecimal((String) l[1]))
                    .build());
        }
        bomRepository.save(bom);
    }

    /** 작업지시 + 생산실적(생산입고/자재소모)을 시딩한다. */
    private void seedWorkOrdersAndProductions(Map<String, Item> items, Warehouse wh) {
        WorkOrder wo1 = saveWorkOrder(items.get("ITM-0001"), wh, 100, LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15), 1);
        WorkOrder wo2 = saveWorkOrder(items.get("ITM-0002"), wh, 200, LocalDate.of(2026, 7, 2), LocalDate.of(2026, 7, 18), 2);
        WorkOrder wo3 = saveWorkOrder(items.get("ITM-0003"), wh, 50, LocalDate.of(2026, 7, 3), LocalDate.of(2026, 7, 20), 3);
        // BOM 없는 반제품 작업지시(대기 상태로 유지)
        saveWorkOrder(items.get("ITM-0004"), wh, 150, LocalDate.of(2026, 7, 4), LocalDate.of(2026, 7, 22), 4);

        // 생산실적 등록(BOM 소요 자재 출고 + 완제품 입고 + 작업지시 진척 갱신)
        productionService.create(new CreateProductionRequest(wo1.getId(), BigDecimal.valueOf(100), LocalDate.of(2026, 7, 5), null), "system");
        productionService.create(new CreateProductionRequest(wo2.getId(), BigDecimal.valueOf(120), LocalDate.of(2026, 7, 6), null), "system");
        productionService.create(new CreateProductionRequest(wo3.getId(), BigDecimal.valueOf(50), LocalDate.of(2026, 7, 7), null), "system");
    }

    private WorkOrder saveWorkOrder(Item product, Warehouse wh, long plannedQty,
                                    LocalDate orderDate, LocalDate dueDate, int seq) {
        WorkOrder wo = WorkOrder.builder()
                .orderNo("WO-" + orderDate.format(DateTimeFormatter.BASIC_ISO_DATE) + "-" + String.format("%04d", seq))
                .product(product)
                .warehouse(wh)
                .plannedQty(BigDecimal.valueOf(plannedQty))
                .orderDate(orderDate)
                .dueDate(dueDate)
                .status(WorkOrderStatus.PLANNED)
                .createdBy("system")
                .build();
        return workOrderRepository.save(wo);
    }

    /** 작업내역(공정별 실적)을 시딩한다. 공정명은 공정 마스터와 매칭되도록 사용. */
    private void seedWorkResults() {
        var wos = workOrderRepository.findAllWithRefs();
        WorkOrder wo1 = wos.stream().filter(w -> w.getProduct().getCode().equals("ITM-0001")).findFirst().orElse(null);
        WorkOrder wo2 = wos.stream().filter(w -> w.getProduct().getCode().equals("ITM-0002")).findFirst().orElse(null);
        WorkOrder wo3 = wos.stream().filter(w -> w.getProduct().getCode().equals("ITM-0003")).findFirst().orElse(null);

        saveWorkResult(wo1, "조립", "김철수", 98, 2, 420, LocalDate.of(2026, 7, 5));
        saveWorkResult(wo1, "검사", "박민수", 100, 0, 90, LocalDate.of(2026, 7, 5));
        saveWorkResult(wo2, "조립", "이영희", 118, 2, 520, LocalDate.of(2026, 7, 6));
        saveWorkResult(wo2, "검사", "박민수", 120, 0, 110, LocalDate.of(2026, 7, 6));
        saveWorkResult(wo3, "용접", "정수진", 49, 1, 700, LocalDate.of(2026, 7, 7));
    }

    private void saveWorkResult(WorkOrder wo, String process, String worker,
                                long good, long defect, int workTimeMin, LocalDate date) {
        workResultRepository.save(WorkResult.builder()
                .workOrder(wo)
                .process(process)
                .worker(worker)
                .goodQty(BigDecimal.valueOf(good))
                .defectQty(BigDecimal.valueOf(defect))
                .workTimeMin(workTimeMin)
                .workDate(date)
                .build());
    }

    /** 생산불출(자재 불출) 내역을 시딩한다. */
    private void seedMaterialIssues(Map<String, Item> items, Warehouse wh) {
        var wos = workOrderRepository.findAllWithRefs();
        WorkOrder wo1 = wos.stream().filter(w -> w.getProduct().getCode().equals("ITM-0001")).findFirst().orElse(null);
        WorkOrder wo2 = wos.stream().filter(w -> w.getProduct().getCode().equals("ITM-0002")).findFirst().orElse(null);
        WorkOrder wo3 = wos.stream().filter(w -> w.getProduct().getCode().equals("ITM-0003")).findFirst().orElse(null);

        saveIssue(items.get("ITM-0004"), wh, wo1, "100", LocalDate.of(2026, 7, 1));
        saveIssue(items.get("ITM-0005"), wh, wo1, "200", LocalDate.of(2026, 7, 1));
        saveIssue(items.get("ITM-0005"), wh, wo2, "120", LocalDate.of(2026, 7, 2));
        saveIssue(items.get("ITM-0006"), wh, wo3, "5", LocalDate.of(2026, 7, 3));
    }

    private void saveIssue(Item item, Warehouse wh, WorkOrder wo, String qty, LocalDate date) {
        materialIssueRepository.save(MaterialIssue.builder()
                .item(item)
                .warehouse(wh)
                .workOrder(wo)
                .qty(new BigDecimal(qty))
                .issueDate(date)
                .build());
    }
}
