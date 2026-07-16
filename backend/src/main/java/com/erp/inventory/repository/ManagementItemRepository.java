package com.erp.inventory.repository;

import com.erp.inventory.domain.ManagementItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ManagementItemRepository extends JpaRepository<ManagementItem, Long> {

    boolean existsByCode(String code);

    long countByCodeStartingWith(String prefix);
}
