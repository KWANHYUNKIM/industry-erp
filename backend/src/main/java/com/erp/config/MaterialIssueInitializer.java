package com.erp.config;

import com.erp.inventory.domain.Item;
import com.erp.production.domain.MaterialIssue;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.domain.WorkOrder;
import com.erp.inventory.repository.ItemRepository;
import com.erp.production.repository.MaterialIssueRepository;
import com.erp.inventory.repository.WarehouseRepository;
import com.erp.production.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 최초 기동 시 생산불출(자재 불출) 데모 데이터를 생성한다.
 * 불출 내역이 하나라도 있으면(ProductionActualInitializer 시딩 포함) 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(12)
@RequiredArgsConstructor
public class MaterialIssueInitializer implements CommandLineRunner {

    private final MaterialIssueRepository materialIssueRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final WorkOrderRepository workOrderRepository;

    @Override
    @Transactional
    public void run(String... args) {
        if (materialIssueRepository.count() > 0) {
            return;
        }
        Warehouse wh = warehouseRepository.findAll().stream().findFirst().orElse(null);
        Item pcb = itemRepository.findByCode("ITM-0004").orElse(null);
        Item plate = itemRepository.findByCode("ITM-0005").orElse(null);
        Item oil = itemRepository.findByCode("ITM-0006").orElse(null);
        if (wh == null || pcb == null || plate == null || oil == null) {
            log.warn("기준 창고/품목이 없어 생산불출 데모 시딩을 건너뜁니다.");
            return;
        }

        List<WorkOrder> wos = workOrderRepository.findAllWithRefs();
        WorkOrder wo1 = findByProductCode(wos, "ITM-0001");
        WorkOrder wo2 = findByProductCode(wos, "ITM-0002");
        WorkOrder wo3 = findByProductCode(wos, "ITM-0003");

        saveIssue(pcb, wh, wo1, "100", LocalDate.of(2026, 7, 1), "MQTT 모뎀 조립 투입");
        saveIssue(plate, wh, wo1, "200", LocalDate.of(2026, 7, 1), "MQTT 모뎀 판재 투입");
        saveIssue(plate, wh, wo2, "120", LocalDate.of(2026, 7, 2), "센서모듈 판재 투입");
        saveIssue(plate, wh, wo3, "150", LocalDate.of(2026, 7, 3), "열교환기 판재 투입");
        saveIssue(oil, wh, wo3, "5", LocalDate.of(2026, 7, 3), "용접 공정 방청유");
        log.info("생산불출 데모 데이터 5건 시딩 완료");
    }

    private WorkOrder findByProductCode(List<WorkOrder> wos, String productCode) {
        return wos.stream()
                .filter(w -> productCode.equals(w.getProduct().getCode()))
                .findFirst().orElse(null);
    }

    private void saveIssue(Item item, Warehouse wh, WorkOrder wo, String qty, LocalDate date, String note) {
        materialIssueRepository.save(MaterialIssue.builder()
                .item(item)
                .warehouse(wh)
                .workOrder(wo)
                .qty(new BigDecimal(qty))
                .issueDate(date)
                .note(note)
                .build());
    }
}
