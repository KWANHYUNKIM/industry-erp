package com.erp.repository;

import com.erp.domain.ProductionProcess;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProcessRepository extends JpaRepository<ProductionProcess, Long> {

    boolean existsByCode(String code);
}
