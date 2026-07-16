package com.erp.config;

import com.erp.production.domain.ProductionProcess;
import com.erp.production.domain.ProductionResource;
import com.erp.production.repository.ProcessRepository;
import com.erp.production.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/**
 * 최초 기동 시 생산 기준정보(공정·자원) 데모 데이터를 생성한다.
 * 이미 존재하면 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
public class ProductionMasterInitializer implements CommandLineRunner {

    private final ProcessRepository processRepository;
    private final ResourceRepository resourceRepository;

    @Override
    @Transactional
    public void run(String... args) {
        seedProcesses();
        seedResources();
    }

    private void seedProcesses() {
        ensureProcess("PRC-010", "절단", "가공1반", 12, 18000);
        ensureProcess("PRC-020", "절곡", "가공1반", 15, 18000);
        ensureProcess("PRC-030", "용접", "용접반", 25, 24000);
        ensureProcess("PRC-040", "조립", "조립반", 30, 20000);
        ensureProcess("PRC-050", "검사", "품질반", 10, 22000);
    }

    private void ensureProcess(String code, String name, String workcenter, int stdTimeMin, long costPerHr) {
        if (!processRepository.existsByCode(code)) {
            processRepository.save(ProductionProcess.builder()
                    .code(code).name(name).workcenter(workcenter)
                    .stdTimeMin(stdTimeMin)
                    .costPerHr(BigDecimal.valueOf(costPerHr))
                    .active(true)
                    .build());
            log.info("데모 공정 생성 → {} {}", code, name);
        }
    }

    private void seedResources() {
        ensureResource("RES-001", "CNC 가공기 #1", "설비", 20, "시간/일", 35000);
        ensureResource("RES-002", "용접로봇 W-2", "설비", 16, "시간/일", 42000);
        ensureResource("RES-101", "조립작업조", "인력", 48, "시간/일", 20000);
        ensureResource("RES-102", "검사작업조", "인력", 24, "시간/일", 22000);
        ensureResource("RES-201", "도금 외주사", "외주", 500, "개/일", 1500);
    }

    private void ensureResource(String code, String name, String type, long capacity, String unit, long costPerHr) {
        if (!resourceRepository.existsByCode(code)) {
            resourceRepository.save(ProductionResource.builder()
                    .code(code).name(name).type(type)
                    .capacity(BigDecimal.valueOf(capacity))
                    .unit(unit)
                    .costPerHr(BigDecimal.valueOf(costPerHr))
                    .active(true)
                    .build());
            log.info("데모 자원 생성 → {} {}", code, name);
        }
    }
}
