package com.erp.trade.repository;

import com.erp.trade.domain.OrderType;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderTypeRepository extends JpaRepository<OrderType, Long> {

    boolean existsByCode(String code);
}
