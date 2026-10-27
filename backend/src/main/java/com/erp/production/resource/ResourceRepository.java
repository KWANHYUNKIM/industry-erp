package com.erp.production.resource;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResourceRepository extends JpaRepository<ProductionResource, Long> {

    boolean existsByCode(String code);
}
