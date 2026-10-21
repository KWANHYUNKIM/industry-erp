package com.erp.accounting.extrafield;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ExtraFieldTypeRepository extends JpaRepository<ExtraFieldType, Long> {
    boolean existsByCode(String code);
}
