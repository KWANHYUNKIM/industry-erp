package com.erp.repository;

import com.erp.domain.SupplyItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupplyRepository extends JpaRepository<SupplyItem, Long> {

    boolean existsByCode(String code);
}
