package com.erp.settings.customfield;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CustomFieldDefRepository extends JpaRepository<CustomFieldDef, Long> {

    List<CustomFieldDef> findByEntityTypeOrderBySortOrderAscIdAsc(String entityType);

    List<CustomFieldDef> findByEntityTypeAndActiveTrueOrderBySortOrderAscIdAsc(String entityType);

    boolean existsByEntityTypeAndFieldKey(String entityType, String fieldKey);
}
