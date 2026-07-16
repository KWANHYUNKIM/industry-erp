package com.erp.production.repository;

import com.erp.production.domain.Production;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProductionRepository extends JpaRepository<Production, Long> {

    @Query("select p from Production p join fetch p.product join fetch p.warehouse join fetch p.workOrder " +
            "order by p.productionDate desc, p.id desc")
    List<Production> findAllWithRefs();
}
