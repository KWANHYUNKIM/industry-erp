package com.erp.production.resource;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ResourceRepository extends JpaRepository<ProductionResource, Long> {

    boolean existsByCode(String code);

    /** 목록 — 대상작업(작업코드)과 그 공정까지 한 번에. open-in-view 가 꺼져 있다. */
    @Query("select distinct r from ProductionResource r left join fetch r.warehouse "
            + "left join fetch r.operations o left join fetch o.process order by r.code")
    List<ProductionResource> findAllWithOperations();
}
