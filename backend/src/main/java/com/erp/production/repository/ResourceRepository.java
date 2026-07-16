package com.erp.production.repository;

import com.erp.production.domain.ProductionResource;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceRepository extends JpaRepository<ProductionResource, Long> {

    boolean existsByCode(String code);
}
