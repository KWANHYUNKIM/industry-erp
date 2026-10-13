package com.erp.trade.ordertype;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderStageRepository extends JpaRepository<OrderStage, Long> {

    boolean existsByCode(String code);
}
