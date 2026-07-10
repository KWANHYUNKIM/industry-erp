package com.erp.repository;

import com.erp.domain.OrderStage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderStageRepository extends JpaRepository<OrderStage, Long> {

    boolean existsByCode(String code);
}
