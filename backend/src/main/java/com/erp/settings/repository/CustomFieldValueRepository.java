package com.erp.settings.repository;

import com.erp.settings.domain.CustomFieldValue;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CustomFieldValueRepository extends JpaRepository<CustomFieldValue, Long> {

    List<CustomFieldValue> findByEntityTypeAndEntityId(String entityType, Long entityId);
}
