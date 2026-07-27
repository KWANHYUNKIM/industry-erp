package com.erp.settings.repository;

import com.erp.settings.domain.CustomFieldDef;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CustomFieldDefRepository extends JpaRepository<CustomFieldDef, Long> {

    List<CustomFieldDef> findByEntityTypeOrderBySortOrderAscIdAsc(String entityType);

    List<CustomFieldDef> findByEntityTypeAndActiveTrueOrderBySortOrderAscIdAsc(String entityType);

    boolean existsByEntityTypeAndFieldKey(String entityType, String fieldKey);
}
