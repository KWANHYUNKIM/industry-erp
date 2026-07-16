package com.erp.config;

import com.erp.inventory.domain.Item;
import com.erp.accounting.domain.ItemCost;
import com.erp.accounting.repository.ItemCostRepository;
import com.erp.inventory.repository.ItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/**
 * 최초 기동 시 품목별 원가(표준/실제) 데모 데이터를 생성한다.
 * 표준과 실제를 다르게 두어 원가차이분석 화면에 차이가 보이도록 한다.
 * 이미 존재하면 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(5)
@RequiredArgsConstructor
public class CostDataInitializer implements CommandLineRunner {

    private static final String PERIOD = "2026-06";

    private final ItemCostRepository itemCostRepository;
    private final ItemRepository itemRepository;

    @Override
    @Transactional
    public void run(String... args) {
        // 표준(재료/노무/경비) → 실제(재료/노무/경비): 실제가 표준과 다르게 하여 차이 발생
        ensureCost("ITM-0001", 18000, 6000, 4000, 18700, 6300, 4200);
        ensureCost("ITM-0002", 24000, 8000, 5500, 23600, 8100, 5400);
        ensureCost("ITM-0003", 95000, 20000, 14000, 98500, 21500, 15200);
        ensureCost("ITM-0004", 12000, 4400, 2700, 12100, 4600, 2900);
        ensureCost("ITM-0005", 8800, 3000, 1800, 9200, 3200, 2000);
    }

    private void ensureCost(String itemCode, long stdMat, long stdLab, long stdOh,
                            long actMat, long actLab, long actOh) {
        Item item = itemRepository.findByCode(itemCode).orElse(null);
        if (item == null) return;
        if (itemCostRepository.existsByItemIdAndPeriod(item.getId(), PERIOD)) return;
        itemCostRepository.save(ItemCost.builder()
                .item(item)
                .period(PERIOD)
                .materialCost(BigDecimal.valueOf(stdMat))
                .laborCost(BigDecimal.valueOf(stdLab))
                .overheadCost(BigDecimal.valueOf(stdOh))
                .actualMaterial(BigDecimal.valueOf(actMat))
                .actualLabor(BigDecimal.valueOf(actLab))
                .actualOverhead(BigDecimal.valueOf(actOh))
                .build());
        log.info("데모 원가 생성 → {} ({})", itemCode, PERIOD);
    }
}
