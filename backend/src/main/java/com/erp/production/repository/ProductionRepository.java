package com.erp.production.repository;

import com.erp.production.domain.Production;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProductionRepository extends JpaRepository<Production, Long> {

    @Query("select p from Production p join fetch p.product join fetch p.warehouse join fetch p.workOrder " +
            "order by p.productionDate desc, p.id desc")
    List<Production> findAllWithRefs();

    /** 작업지시에 붙은 생산실적 수. 작업지시를 지워도 되는지 판단한다. */
    long countByWorkOrder_Id(Long workOrderId);
}
