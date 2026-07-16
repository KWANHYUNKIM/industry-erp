package com.erp.settings.repository;

import com.erp.settings.domain.Company;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CompanyRepository extends JpaRepository<Company, Long> {

    Optional<Company> findByCode(String code);

    boolean existsByCode(String code);

    boolean existsBySchemaName(String schemaName);
}
