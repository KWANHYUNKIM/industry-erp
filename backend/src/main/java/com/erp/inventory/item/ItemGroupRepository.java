package com.erp.inventory.item;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemGroupRepository extends JpaRepository<ItemGroup, Long> {

    boolean existsByCode(String code);
}
