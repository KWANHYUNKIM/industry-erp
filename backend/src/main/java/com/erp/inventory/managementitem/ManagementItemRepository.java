package com.erp.inventory.managementitem;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ManagementItemRepository extends JpaRepository<ManagementItem, Long> {

    boolean existsByCode(String code);

}
