package com.erp.repository;

import com.erp.domain.ManagementItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ManagementItemRepository extends JpaRepository<ManagementItem, Long> {

    boolean existsByCode(String code);

    long countByCodeStartingWith(String prefix);
}
