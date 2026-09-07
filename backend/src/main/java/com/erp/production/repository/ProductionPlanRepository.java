package com.erp.production.repository;

import com.erp.production.domain.ProductionPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProductionPlanRepository extends JpaRepository<ProductionPlan, Long> {

    @Query("select p from ProductionPlan p join fetch p.product " +
            "order by p.planWeek desc, p.id desc")
    List<ProductionPlan> findAllWithProduct();

    /** 그 작업지시에서 나온 계획들. 작업지시를 지울 때 연결을 푼다. */
    java.util.List<ProductionPlan> findByWorkOrder_Id(Long workOrderId);
}
