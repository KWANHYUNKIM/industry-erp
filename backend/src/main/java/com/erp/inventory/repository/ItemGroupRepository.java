package com.erp.inventory.repository;

import com.erp.inventory.domain.ItemGroup;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemGroupRepository extends JpaRepository<ItemGroup, Long> {

    boolean existsByCode(String code);
}
