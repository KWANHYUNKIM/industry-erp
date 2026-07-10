package com.erp.config;

import com.erp.domain.OrderStage;
import com.erp.domain.OrderType;
import com.erp.repository.OrderStageRepository;
import com.erp.repository.OrderTypeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 최초 기동 시 오더관리 메타(유형·진행단계) 데모 데이터를 생성한다.
 * 이미 존재하면 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(13)
@RequiredArgsConstructor
public class OrderMetaInitializer implements CommandLineRunner {

    private final OrderTypeRepository orderTypeRepository;
    private final OrderStageRepository orderStageRepository;

    @Override
    @Transactional
    public void run(String... args) {
        seedOrderTypes();
        seedOrderStages();
    }

    private void seedOrderTypes() {
        ensureType("OT-01", "일반수주", "표준 납기 일반 판매 오더");
        ensureType("OT-02", "견적", "견적 단계 가오더");
        ensureType("OT-03", "샘플", "무상/유상 샘플 출고 오더");
        ensureType("OT-04", "긴급", "단기 납기 긴급 처리 오더");
        ensureType("OT-05", "정기납품", "월 정기 납품 계약 오더");
    }

    private void ensureType(String code, String name, String description) {
        if (!orderTypeRepository.existsByCode(code)) {
            orderTypeRepository.save(OrderType.builder()
                    .code(code).name(name).description(description)
                    .active(true)
                    .build());
            log.info("데모 오더유형 생성 → {} {}", code, name);
        }
    }

    private void seedOrderStages() {
        ensureStage("ST-01", "접수", 1);
        ensureStage("ST-02", "견적", 2);
        ensureStage("ST-03", "수주확정", 3);
        ensureStage("ST-04", "생산", 4);
        ensureStage("ST-05", "출하", 5);
    }

    private void ensureStage(String code, String name, int sortOrder) {
        if (!orderStageRepository.existsByCode(code)) {
            orderStageRepository.save(OrderStage.builder()
                    .code(code).name(name).sortOrder(sortOrder)
                    .active(true)
                    .build());
            log.info("데모 진행단계 생성 → {} {}", code, name);
        }
    }
}
