package com.erp.groupware.repository;

import com.erp.groupware.domain.SupplyItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupplyRepository extends JpaRepository<SupplyItem, Long> {

    boolean existsByCode(String code);
}
