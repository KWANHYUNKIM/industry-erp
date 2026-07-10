package com.erp.repository;

import com.erp.domain.OrderType;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderTypeRepository extends JpaRepository<OrderType, Long> {

    boolean existsByCode(String code);
}
