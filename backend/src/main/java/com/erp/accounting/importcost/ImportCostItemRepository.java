package com.erp.accounting.importcost;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ImportCostItemRepository extends JpaRepository<ImportCostItem, Long> {
    List<ImportCostItem> findAllByOrderBySortOrderAscCodeAsc();
    boolean existsByCode(String code);
}
