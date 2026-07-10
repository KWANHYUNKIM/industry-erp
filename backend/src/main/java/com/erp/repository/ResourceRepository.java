package com.erp.repository;

import com.erp.domain.ProductionResource;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceRepository extends JpaRepository<ProductionResource, Long> {

    boolean existsByCode(String code);
}
