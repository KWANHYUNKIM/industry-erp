package com.erp.trade.repository;

import com.erp.trade.domain.OrderStage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderStageRepository extends JpaRepository<OrderStage, Long> {

    boolean existsByCode(String code);
}
