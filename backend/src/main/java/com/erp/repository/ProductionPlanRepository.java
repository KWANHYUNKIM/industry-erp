package com.erp.repository;

import com.erp.domain.ProductionPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProductionPlanRepository extends JpaRepository<ProductionPlan, Long> {

    @Query("select p from ProductionPlan p join fetch p.product " +
            "order by p.planWeek desc, p.id desc")
    List<ProductionPlan> findAllWithProduct();
}
