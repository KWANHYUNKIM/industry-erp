package com.erp.repository;

import com.erp.domain.ItemGroup;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemGroupRepository extends JpaRepository<ItemGroup, Long> {

    boolean existsByCode(String code);
}
