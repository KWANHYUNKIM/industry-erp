package com.erp.trade.ordertype;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderTypeRepository extends JpaRepository<OrderType, Long> {

    boolean existsByCode(String code);
}
